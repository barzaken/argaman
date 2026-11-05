"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/zod-he";

import { toHebrewError } from "@/lib/db/errors";
import {
  optionalDateSchema,
  optionalHttpUrlSchema,
  orderItemStatusSchema,
} from "@/lib/db/validation";

import { roundMoney } from "@/lib/db/calculations";
import { todayIsoInIsrael } from "@/lib/db/format";
import type {
  InventoryFinishLevelDb,
  InventoryPieceTypeDb,
  OrderItemStatusDb,
  OrderStatusDb,
  PriorityDb,
} from "@/lib/db/types";
import { requireAdmin, requireAuth } from "@/lib/supabase/auth-helpers";

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

/**
 * חיוב נוסף כפי שהוקלד בטופס: סכום חיובי (גם בהנחה), כולל/לא כולל מע״מ לפי
 * הדגל של הטופס. השרת ממיר לנטו ומסמן הנחה כשלילית (order_charges.amount).
 */
const chargeInputSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["shipping", "processing", "service", "discount", "other"]),
  description: z.string().trim().min(1, "חסר תיאור לחיוב").max(300, "תיאור החיוב ארוך מדי"),
  amount: z.coerce
    .number({ message: "סכום חיוב לא תקין" })
    .positive("סכום החיוב חייב להיות גדול מ-0")
    .max(10_000_000, "סכום חיוב גבוה מדי"),
});

type ChargeInput = z.infer<typeof chargeInputSchema>;

function chargeRowAmount(c: ChargeInput, vatIncluded: boolean, vatRate: number): number {
  const ex = roundMoney(vatIncluded ? c.amount / (1 + vatRate) : c.amount);
  return c.kind === "discount" ? -ex : ex;
}

const requiredDocumentDateSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך המסמך לא תקין")
    .refine((s) => !Number.isNaN(Date.parse(s)), "תאריך המסמך לא תקין")
    .optional()
);

const notesSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().max(4000, "ההערות ארוכות מדי").nullable().optional()
);

const createOrderPayloadSchema = z.object({
  customer_id: z.string().uuid(),
  document_date: requiredDocumentDateSchema,
  notes: notesSchema,
  charges: z.array(chargeInputSchema).max(30, "יותר מדי חיובים").optional(),
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
  if (!auth.ok) return { ok: false, message: auth.message };
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

  // תאריך מסמך + הערות + חיובים — אחרי ה-RPC (שלא מכיר אותם).
  // אם משהו נכשל: מוחקים את ההזמנה (משחרר מלאי) ומדווחים, כדי לא להשאיר
  // הזמנה עם סכום שגוי.
  const documentDate = parsed.data.document_date ?? todayIsoInIsrael();
  const notes = parsed.data.notes ?? null;
  const charges = parsed.data.charges ?? [];

  async function rollbackOrder(reason: string): Promise<ActionResult> {
    const { error: delError } = await supabase.rpc("crm_delete_order", {
      p_order_id: orderId,
    });
    if (delError) {
      // סוכן לא יכול למחוק — ההזמנה נשארת; אומרים בדיוק מה קרה
      const { data: num } = await supabase
        .from("orders")
        .select("order_number")
        .eq("id", orderId)
        .single();
      return {
        ok: false,
        message: `${reason} ההזמנה${
          num?.order_number ? ` #${num.order_number}` : ""
        } נוצרה בלי החיובים/הפרטים הנוספים — יש להשלים אותם בעריכת ההזמנה (או לבקש ממנהל למחוק אותה).`,
      };
    }
    await rollbackCreatedInventory();
    return { ok: false, message: `${reason} ההזמנה לא נשמרה — נסו שוב.` };
  }

  if (documentDate !== todayIsoInIsrael() || notes) {
    const { error: hdrError } = await supabase
      .from("orders")
      .update({ document_date: documentDate, notes })
      .eq("id", orderId);
    if (hdrError) {
      return rollbackOrder(toHebrewError(hdrError, "שמירת תאריך המסמך / ההערות נכשלה."));
    }
  }

  if (charges.length > 0) {
    const { error: chError } = await supabase.from("order_charges").insert(
      charges.map((c, i) => ({
        order_id: orderId,
        kind: c.kind,
        description: c.description,
        amount: chargeRowAmount(c, parsed.data.vat_included, vatRate),
        sort_order: i,
      }))
    );
    if (chError) {
      return rollbackOrder(toHebrewError(chError, "שמירת החיובים הנוספים נכשלה."));
    }
  }

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/order-items");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard");
  return { ok: true, id: orderId };
}

export async function deleteOrder(orderId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

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
  document_date: requiredDocumentDateSchema,
  notes: notesSchema,
  /** undefined = לא נוגעים בחיובים (למשל כשיש תעודת משלוח) */
  charges: z.array(chargeInputSchema).max(30, "יותר מדי חיובים").optional(),
  /** האם סכומי החיובים בטופס כוללים מע״מ */
  charges_vat_included: z.boolean().optional(),
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
  raw: z.input<typeof updateOrderHeaderSchema>
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
      ...(parsed.data.document_date
        ? { document_date: parsed.data.document_date }
        : {}),
      notes: parsed.data.notes ?? null,
    })
    .eq("id", parsed.data.id);

  if (error) return { ok: false, message: toHebrewError(error) };

  if (parsed.data.charges) {
    const chargesResult = await syncOrderCharges(
      auth.supabase,
      parsed.data.id,
      parsed.data.charges,
      parsed.data.charges_vat_included ?? false
    );
    if (!chargesResult.ok) {
      return {
        ok: false,
        message: `פרטי ההזמנה נשמרו, אבל החיובים לא עודכנו: ${chargesResult.message}`,
      };
    }
  }

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
  if (!auth.ok) return { ok: false, message: auth.message };

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

type ServerSupabase = Extract<
  Awaited<ReturnType<typeof requireAuth>>,
  { ok: true }
>["supabase"];

/**
 * מסנכרן את order_charges של הזמנה מול הרשימה מהטופס: מעדכן קיימים
 * (רק אם השתנו), מוסיף חדשים ומוחק שהוסרו — כך יומן הפעולות מראה רק שינויים
 * אמיתיים. ה-DB מחשב מחדש את סכומי ההזמנה, וחוסם (order has delivery)
 * כשכבר הופקה תעודת משלוח.
 */
async function syncOrderCharges(
  supabase: ServerSupabase,
  orderId: string,
  charges: ChargeInput[],
  vatIncluded: boolean
): Promise<ActionResult> {
  const [{ data: order, error: orderError }, { data: existing, error: exError }] =
    await Promise.all([
      supabase.from("orders").select("vat_rate").eq("id", orderId).single(),
      supabase
        .from("order_charges")
        .select("id, kind, description, amount, sort_order")
        .eq("order_id", orderId),
    ]);
  if (orderError || !order) return { ok: false, message: toHebrewError(orderError) };
  if (exError) return { ok: false, message: toHebrewError(exError) };

  const vatRate = Number(order.vat_rate ?? 0.18);
  const existingById = new Map(
    (existing ?? []).map((r) => [r.id as string, r])
  );
  const keepIds = new Set(charges.map((c) => c.id).filter(Boolean) as string[]);

  const toDelete = [...existingById.keys()].filter((id) => !keepIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("order_charges")
      .delete()
      .in("id", toDelete)
      .eq("order_id", orderId);
    if (error) return { ok: false, message: toHebrewError(error) };
  }

  for (const [i, c] of charges.entries()) {
    const amount = chargeRowAmount(c, vatIncluded, vatRate);
    const prev = c.id ? existingById.get(c.id) : undefined;
    if (prev) {
      const changed =
        prev.kind !== c.kind ||
        prev.description !== c.description ||
        Math.abs(Number(prev.amount) - amount) > 0.004 ||
        Number(prev.sort_order) !== i;
      if (!changed) continue;
      const { error } = await supabase
        .from("order_charges")
        .update({ kind: c.kind, description: c.description, amount, sort_order: i })
        .eq("id", prev.id as string)
        .eq("order_id", orderId);
      if (error) return { ok: false, message: toHebrewError(error) };
    } else {
      const { error } = await supabase.from("order_charges").insert({
        order_id: orderId,
        kind: c.kind,
        description: c.description,
        amount,
        sort_order: i,
      });
      if (error) return { ok: false, message: toHebrewError(error) };
    }
  }

  return { ok: true };
}
