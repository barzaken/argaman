"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type {
  OrderItemStatusDb,
  OrderStatusDb,
  PriorityDb,
} from "@/lib/db/types";
import { requireAuth } from "@/lib/supabase/auth-helpers";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; message: string };

const orderItemInputSchema = z.object({
  stone_id: z.string().uuid(),
  inventory_item_id: z.string().uuid(),
  length_m: z.coerce.number().positive(),
  width_m: z.coerce.number().positive(),
  height_m: z.coerce.number().positive(),
  quantity: z.coerce.number().int().positive(),
  price_per_m3: z.coerce.number().nonnegative(),
});

const createOrderPayloadSchema = z.object({
  customer_id: z.string().uuid(),
  priority: z.enum(["low", "medium", "urgent"]),
  supply_due_date: z.string().optional().nullable(),
  signature_url: z.string().optional().nullable(),
  vat_rate: z.coerce.number().min(0).max(1).optional(),
  vat_included: z.boolean(),
  items: z.array(orderItemInputSchema).min(1),
});

export async function createOrder(
  raw: z.input<typeof createOrderPayloadSchema>
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = createOrderPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  const vatRate = parsed.data.vat_rate ?? 0.18;

  const { data, error } = await auth.supabase.rpc("crm_create_order_with_items", {
    p_customer_id: parsed.data.customer_id,
    p_priority: parsed.data.priority as PriorityDb,
    p_supply_due_date: parsed.data.supply_due_date || null,
    p_signature_url: parsed.data.signature_url?.trim() || null,
    p_vat_rate: vatRate,
    p_vat_included: parsed.data.vat_included,
    p_items: parsed.data.items,
  });

  if (error) return { ok: false, message: error.message };

  const orderId = data as string;

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/order-items");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard");
  return { ok: true, id: orderId };
}

export async function deleteOrder(orderId: string): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = z.string().uuid().safeParse(orderId);
  if (!parsed.success) return { ok: false, message: "מזהה לא תקין" };

  const { error } = await auth.supabase.rpc("crm_delete_order", {
    p_order_id: parsed.data,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/order-items");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard");
  return { ok: true };
}

const updateOrderHeaderSchema = z.object({
  id: z.string().uuid(),
  priority: z.enum(["low", "medium", "urgent"]),
  supply_due_date: z.string().optional().nullable(),
  signature_url: z.string().optional().nullable(),
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
  if (!auth.ok) return { ok: false, message: auth.message };

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

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${parsed.data.id}`);
  revalidatePath("/dashboard/order-items");
  return { ok: true };
}

export async function updateOrderItemStatus(
  itemId: string,
  status: OrderItemStatusDb
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const idParsed = z.string().uuid().safeParse(itemId);
  if (!idParsed.success) return { ok: false, message: "מזהה לא תקין" };

  const { error } = await auth.supabase
    .from("order_items")
    .update({ status })
    .eq("id", idParsed.data);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/order-items");
  revalidatePath("/dashboard/orders");
  return { ok: true };
}
