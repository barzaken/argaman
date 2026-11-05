"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toHebrewError } from "@/lib/db/errors";
import {
  optionalDateSchema,
  optionalHttpUrlSchema,
  orderItemStatusSchema,
} from "@/lib/db/validation";

import type {
  InventoryFinishLevelDb,
  InventoryPieceTypeDb,
  OrderItemStatusDb,
  OrderStatusDb,
  PriorityDb,
} from "@/lib/db/types";
import { requireAuth } from "@/lib/supabase/auth-helpers";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; message: string };

const orderItemInputSchema = z
  .object({
    stone_id: z.string().uuid(),
    inventory_item_id: z.string().uuid().optional().nullable(),
    not_in_inventory: z.boolean().optional(),
    finish_level: z
      .enum(["halak", "tuboza", "masmesm"])
      .optional()
      .nullable(),
    piece_type: z
      .enum(["panel", "frame", "plate", "standing_stone"])
      .optional()
      .nullable(),
    length_m: z.coerce.number().positive(),
    width_m: z.coerce.number().positive(),
    height_m: z.coerce.number().positive(),
    quantity: z.coerce.number().int().positive(),
    price_per_m3: z.coerce.number().nonnegative(),
  })
  .superRefine((item, ctx) => {
    const adhoc = item.not_in_inventory === true;
    if (adhoc) {
      if (!item.finish_level) {
        ctx.addIssue({
          code: "custom",
          message: "בפריט שלא במלאי חובה רמת גימור",
          path: ["finish_level"],
        });
      }
      if (!item.piece_type) {
        ctx.addIssue({
          code: "custom",
          message: "בפריט שלא במלאי חובה סוג חלק",
          path: ["piece_type"],
        });
      }
      return;
    }
    if (!item.inventory_item_id) {
      ctx.addIssue({
        code: "custom",
        message: "חסר משלוח במלאי",
        path: ["inventory_item_id"],
      });
    }
  });

const createOrderPayloadSchema = z.object({
  customer_id: z.string().uuid(),
  priority: z.enum(["low", "medium", "urgent"]),
  supply_due_date: optionalDateSchema,
  signature_url: optionalHttpUrlSchema,
  vat_rate: z.coerce.number().min(0).max(1).optional(),
  vat_included: z.boolean(),
  items: z.array(orderItemInputSchema).min(1, "נא להוסיף לפחות פריט אחד תקין"),
});

export async function createOrder(
  raw: z.input<typeof createOrderPayloadSchema>
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: toHebrewError(auth) };
  const { supabase } = auth;

  const parsed = createOrderPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  const vatRate = parsed.data.vat_rate ?? 0.18;

  const resolvedItems: {
    stone_id: string;
    inventory_item_id: string;
    length_m: number;
    width_m: number;
    height_m: number;
    quantity: number;
    price_per_m3: number;
  }[] = [];

  const vatFactor = 1 + vatRate;
  const createdInventoryIds: string[] = [];

  async function rollbackCreatedInventory() {
    if (createdInventoryIds.length === 0) return;
    await supabase
      .from("inventory_items")
      .delete()
      .in("id", createdInventoryIds);
  }

  for (const item of parsed.data.items) {
    if (item.not_in_inventory) {
      const invPrice = parsed.data.vat_included
        ? Math.round((item.price_per_m3 / vatFactor) * 10000) / 10000
        : item.price_per_m3;

      const { data: inv, error: invError } = await supabase
        .from("inventory_items")
        .insert({
          stone_id: item.stone_id,
          length_m: item.length_m,
          width_m: item.width_m,
          height_m: item.height_m,
          quantity_total: item.quantity,
          pricing_unit: "m3",
          price_per_m2: null,
          price_per_m3: invPrice,
          customer_price: invPrice,
          status: "available",
          finish_level: item.finish_level as InventoryFinishLevelDb,
          piece_type: item.piece_type as InventoryPieceTypeDb,
          expected_arrival_date: null,
        })
        .select("id")
        .single();

      if (invError || !inv) {
        await rollbackCreatedInventory();
        return {
          ok: false,
          message: toHebrewError(invError, "שגיאה ביצירת פריט מלאי"),
        };
      }

      createdInventoryIds.push(inv.id as string);
      resolvedItems.push({
        stone_id: item.stone_id,
        inventory_item_id: inv.id as string,
        length_m: item.length_m,
        width_m: item.width_m,
        height_m: item.height_m,
        quantity: item.quantity,
        price_per_m3: item.price_per_m3,
      });
      continue;
    }

    resolvedItems.push({
      stone_id: item.stone_id,
      inventory_item_id: item.inventory_item_id as string,
      length_m: item.length_m,
      width_m: item.width_m,
      height_m: item.height_m,
      quantity: item.quantity,
      price_per_m3: item.price_per_m3,
    });
  }

  const { data, error } = await supabase.rpc("crm_create_order_with_items", {
    p_customer_id: parsed.data.customer_id,
    p_priority: parsed.data.priority as PriorityDb,
    p_supply_due_date: parsed.data.supply_due_date || null,
    p_signature_url: parsed.data.signature_url?.trim() || null,
    p_vat_rate: vatRate,
    p_vat_included: parsed.data.vat_included,
    p_items: resolvedItems,
  });

  if (error) {
    await rollbackCreatedInventory();
    return { ok: false, message: toHebrewError(error) };
  }

  const orderId = data as string;

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/order-items");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard");
  return { ok: true, id: orderId };
}

export async function deleteOrder(orderId: string): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: toHebrewError(auth) };

  const parsed = z.string().uuid().safeParse(orderId);
  if (!parsed.success) return { ok: false, message: "מזהה לא תקין" };

  const { error } = await auth.supabase.rpc("crm_delete_order", {
    p_order_id: parsed.data,
  });

  if (error) return { ok: false, message: toHebrewError(error) };

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/order-items");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard");
  return { ok: true };
}

const updateOrderHeaderSchema = z.object({
  id: z.string().uuid(),
  priority: z.enum(["low", "medium", "urgent"]),
  supply_due_date: optionalDateSchema,
  signature_url: optionalHttpUrlSchema,
  status: z.enum([
    "open",
    "in_production",
    "ready_for_delivery",
    "completed",
    "cancelled",
  ]),
});

export async function updateOrderHeader(
  raw: z.infer<typeof updateOrderHeaderSchema>
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: toHebrewError(auth) };

  const parsed = updateOrderHeaderSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  const { error } = await auth.supabase
    .from("orders")
    .update({
      priority: parsed.data.priority as PriorityDb,
      supply_due_date: parsed.data.supply_due_date || null,
      signature_url: parsed.data.signature_url?.trim() || null,
      status: parsed.data.status as OrderStatusDb,
    })
    .eq("id", parsed.data.id);

  if (error) return { ok: false, message: toHebrewError(error) };

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${parsed.data.id}`);
  revalidatePath("/dashboard/order-items");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateOrderItemStatus(
  itemId: string,
  status: OrderItemStatusDb
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: toHebrewError(auth) };

  const idParsed = z.string().uuid().safeParse(itemId);
  if (!idParsed.success) return { ok: false, message: "מזהה לא תקין" };
  const statusParsed = orderItemStatusSchema.safeParse(status);
  if (!statusParsed.success) return { ok: false, message: "סטטוס לא תקין" };

  const { error } = await auth.supabase
    .from("order_items")
    .update({ status: statusParsed.data })
    .eq("id", idParsed.data);

  if (error) return { ok: false, message: toHebrewError(error) };

  revalidatePath("/dashboard/order-items");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  return { ok: true };
}
