"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { PriorityDb, QuotePricingUnitDb } from "@/lib/db/types";
import { requireAuth } from "@/lib/supabase/auth-helpers";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; message: string };

const quoteItemInputSchema = z
  .object({
    stone_id: z.string().uuid(),
    length_m: z.coerce.number().positive(),
    width_m: z.coerce.number().positive(),
    height_m: z.coerce.number().positive(),
    quantity: z.coerce.number().int().positive(),
    pricing_unit: z.enum(["m3", "m2", "unit"]),
    price_per_m3: z.coerce.number().nonnegative().optional(),
    price_per_m2: z.coerce.number().nonnegative().optional(),
    price_per_unit: z.coerce.number().nonnegative().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.pricing_unit === "m3") {
      if (data.price_per_m3 == null || Number.isNaN(data.price_per_m3)) {
        ctx.addIssue({
          code: "custom",
          message: "חובה מחיר לקו״ב",
          path: ["price_per_m3"],
        });
      }
      return;
    }
    if (data.pricing_unit === "m2") {
      if (data.price_per_m2 == null || Number.isNaN(data.price_per_m2)) {
        ctx.addIssue({
          code: "custom",
          message: "חובה מחיר למ״ר",
          path: ["price_per_m2"],
        });
      }
      return;
    }
    if (data.price_per_unit == null || Number.isNaN(data.price_per_unit)) {
      ctx.addIssue({
        code: "custom",
        message: "חובה מחיר ליחידה",
        path: ["price_per_unit"],
      });
    }
  });

const createQuotePayloadSchema = z.object({
  customer_id: z.string().uuid(),
  valid_until: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  vat_rate: z.coerce.number().min(0).max(1).optional(),
  vat_included: z.boolean(),
  items: z.array(quoteItemInputSchema).min(1, "נא להוסיף לפחות פריט אחד תקין"),
});

const updateQuotePayloadSchema = createQuotePayloadSchema.extend({
  id: z.string().uuid(),
});

const convertQuoteItemSchema = z.object({
  quote_item_id: z.string().uuid(),
  inventory_item_id: z.string().uuid(),
});

const createOrderFromQuoteSchema = z.object({
  quote_id: z.string().uuid(),
  priority: z.enum(["low", "medium", "urgent"]),
  supply_due_date: z.string().optional().nullable(),
  signature_url: z.string().optional().nullable(),
  items: z.array(convertQuoteItemSchema).min(1),
});

export async function createQuote(
  raw: z.input<typeof createQuotePayloadSchema>
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = createQuotePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  const vatRate = parsed.data.vat_rate ?? 0.18;

  const { data, error } = await auth.supabase.rpc("crm_create_quote_with_items", {
    p_customer_id: parsed.data.customer_id,
    p_valid_until: parsed.data.valid_until || null,
    p_notes: parsed.data.notes?.trim() || null,
    p_vat_rate: vatRate,
    p_vat_included: parsed.data.vat_included,
    p_items: parsed.data.items,
  });

  if (error) return { ok: false, message: error.message };

  const quoteId = data as string;

  revalidatePath("/dashboard/quotes");
  revalidatePath("/dashboard");
  return { ok: true, id: quoteId };
}

export async function updateQuote(
  raw: z.input<typeof updateQuotePayloadSchema>
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = updateQuotePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  const vatRate = parsed.data.vat_rate ?? 0.18;

  const { error } = await auth.supabase.rpc("crm_update_quote_with_items", {
    p_quote_id: parsed.data.id,
    p_customer_id: parsed.data.customer_id,
    p_valid_until: parsed.data.valid_until || null,
    p_notes: parsed.data.notes?.trim() || null,
    p_vat_rate: vatRate,
    p_vat_included: parsed.data.vat_included,
    p_items: parsed.data.items,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/quotes");
  revalidatePath(`/dashboard/quotes/${parsed.data.id}`);
  revalidatePath(`/dashboard/quotes/${parsed.data.id}/edit`);
  return { ok: true, id: parsed.data.id };
}

export async function deleteQuote(quoteId: string): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = z.string().uuid().safeParse(quoteId);
  if (!parsed.success) return { ok: false, message: "מזהה לא תקין" };

  const { error } = await auth.supabase.rpc("crm_delete_quote", {
    p_quote_id: parsed.data,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/quotes");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createOrderFromQuote(
  raw: z.input<typeof createOrderFromQuoteSchema>
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = createOrderFromQuoteSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  const { data, error } = await auth.supabase.rpc("crm_create_order_from_quote", {
    p_quote_id: parsed.data.quote_id,
    p_priority: parsed.data.priority as PriorityDb,
    p_supply_due_date: parsed.data.supply_due_date || null,
    p_signature_url: parsed.data.signature_url?.trim() || null,
    p_items: parsed.data.items,
  });

  if (error) return { ok: false, message: error.message };

  const orderId = data as string;

  revalidatePath("/dashboard/quotes");
  revalidatePath(`/dashboard/quotes/${parsed.data.quote_id}`);
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/order-items");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard");
  return { ok: true, id: orderId };
}

export type { QuotePricingUnitDb };
