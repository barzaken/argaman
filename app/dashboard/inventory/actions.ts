"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/zod-he";

import { toHebrewError } from "@/lib/db/errors";
import { optionalDateSchema } from "@/lib/db/validation";

import { derivePricePerM3FromM2 } from "@/lib/db/calculations";
import { requireAdmin, requireAuth } from "@/lib/supabase/auth-helpers";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; message: string };

const optionalUuid = z.preprocess(
  (v) => (v == null || (typeof v === "string" && v.trim() === "") ? null : v),
  z.string().uuid("מזהה לא תקין").nullable()
);

const inventoryBaseSchema = z.object({
  stone_id: z.string().uuid(),
  length_m: z.coerce.number().positive(),
  width_m: z.coerce.number().positive(),
  height_m: z.coerce.number().positive(),
  quantity_total: z.coerce.number().int().positive(),
  pricing_unit: z.enum(["m3", "m2"]),
  price_per_m3: z.coerce.number().nonnegative().optional(),
  price_per_m2: z.coerce.number().nonnegative().optional(),
  customer_price: z.coerce.number().nonnegative(),
  status: z.enum(["available", "unavailable", "in_transit"]),
  finish_level: z.enum(["halak", "tuboza", "masmesm"]),
  piece_type: z.enum(["panel", "frame", "plate", "standing_stone"]),
  expected_arrival_date: optionalDateSchema,
  supplier_id: optionalUuid,
  source_document_id: optionalUuid,
});

type InventoryFormParsed = z.infer<typeof inventoryBaseSchema>;

type InventoryPricingPayload = {
  pricing_unit: "m3" | "m2";
  price_per_m2: number | null;
  price_per_m3: number;
  customer_price: number;
};

function resolveInventoryPricing(
  data: InventoryFormParsed
): InventoryPricingPayload | { error: string } {
  if (data.pricing_unit === "m3") {
    if (data.price_per_m3 == null || Number.isNaN(data.price_per_m3)) {
      return { error: "חובה מחיר לקו״ב" };
    }
    return {
      pricing_unit: "m3",
      price_per_m2: null,
      price_per_m3: data.price_per_m3,
      customer_price: data.customer_price,
    };
  }

  if (data.price_per_m2 == null || Number.isNaN(data.price_per_m2)) {
    return { error: "חובה מחיר למ״ר" };
  }

  const pricePerM3 = derivePricePerM3FromM2(data.price_per_m2, data.height_m);
  const customerPerM3 = derivePricePerM3FromM2(
    data.customer_price,
    data.height_m
  );

  return {
    pricing_unit: "m2",
    price_per_m2: data.price_per_m2,
    price_per_m3: pricePerM3,
    customer_price: customerPerM3,
  };
}

function parseInventoryFormData(formData: FormData) {
  const status = formData.get("status") as string;
  const expectedRaw = formData.get("expected_arrival_date");
  const pricingUnit = formData.get("pricing_unit") as string;

  return inventoryBaseSchema.safeParse({
    stone_id: formData.get("stone_id"),
    length_m: formData.get("length_m"),
    width_m: formData.get("width_m"),
    height_m: formData.get("height_m"),
    quantity_total: formData.get("quantity_total"),
    pricing_unit: pricingUnit === "m2" ? "m2" : "m3",
    price_per_m3:
      pricingUnit === "m3" ? formData.get("price_per_m3") : undefined,
    price_per_m2:
      pricingUnit === "m2" ? formData.get("price_per_m2") : undefined,
    customer_price: formData.get("customer_price"),
    status,
    finish_level: formData.get("finish_level"),
    piece_type: formData.get("piece_type"),
    expected_arrival_date:
      expectedRaw && String(expectedRaw).length > 0
        ? String(expectedRaw)
        : null,
    supplier_id: formData.get("supplier_id"),
    source_document_id: formData.get("source_document_id"),
  });
}

type Supa = Extract<Awaited<ReturnType<typeof requireAuth>>, { ok: true }>["supabase"];

/** מסמך מקור (תעודת משלוח מספק): קיים ולא נדחה */
async function checkSourceDocument(
  supabase: Supa,
  documentId: string
): Promise<{ ok: true; kind: string; status: string; supplier_id: string | null } | { ok: false; message: string }> {
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, kind, status, supplier_id")
    .eq("id", documentId)
    .maybeSingle();
  if (error) return { ok: false, message: toHebrewError(error) };
  if (!doc) return { ok: false, message: "מסמך המקור לא נמצא — ייתכן שנמחק." };
  if (doc.status === "rejected") {
    return { ok: false, message: "מסמך המקור סומן כ״נדחה״ — לא ניתן לקלוט ממנו מלאי." };
  }
  return {
    ok: true,
    kind: doc.kind as string,
    status: doc.status as string,
    supplier_id: (doc.supplier_id as string | null) ?? null,
  };
}

export async function createInventoryItem(
  formData: FormData
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = parseInventoryFormData(formData);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  if (
    parsed.data.status === "in_transit" &&
    !parsed.data.expected_arrival_date
  ) {
    return {
      ok: false,
      message: "בסטטוס ״בדרך״ חובה תאריך צפי הגעה",
    };
  }

  const pricing = resolveInventoryPricing(parsed.data);
  if ("error" in pricing) {
    return { ok: false, message: pricing.error };
  }

  let sourceDoc: Awaited<ReturnType<typeof checkSourceDocument>> | null = null;
  if (parsed.data.source_document_id) {
    sourceDoc = await checkSourceDocument(auth.supabase, parsed.data.source_document_id);
    if (!sourceDoc.ok) return { ok: false, message: sourceDoc.message };
  }

  const insertPayload = {
    stone_id: parsed.data.stone_id,
    supplier_id: parsed.data.supplier_id,
    source_document_id: parsed.data.source_document_id,
    length_m: parsed.data.length_m,
    width_m: parsed.data.width_m,
    height_m: parsed.data.height_m,
    quantity_total: parsed.data.quantity_total,
    pricing_unit: pricing.pricing_unit,
    price_per_m2: pricing.price_per_m2,
    price_per_m3: pricing.price_per_m3,
    customer_price: pricing.customer_price,
    status: parsed.data.status,
    finish_level: parsed.data.finish_level,
    piece_type: parsed.data.piece_type,
    expected_arrival_date:
      parsed.data.status === "in_transit"
        ? parsed.data.expected_arrival_date
        : null,
  };

  const { data: inserted, error } = await auth.supabase
    .from("inventory_items")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !inserted) return { ok: false, message: toHebrewError(error) };

  // קליטה מתעודת משלוח של ספק — המסמך מסומן "טופל" (ומקושר לספק אם חסר)
  if (sourceDoc?.ok && parsed.data.source_document_id) {
    const patch: Record<string, unknown> = {};
    if (sourceDoc.status === "pending_review" && sourceDoc.kind === "supplier_delivery_note") {
      patch.status = "processed";
      patch.reviewed_by = auth.userId;
      patch.reviewed_at = new Date().toISOString();
    }
    if (!sourceDoc.supplier_id && parsed.data.supplier_id) {
      patch.supplier_id = parsed.data.supplier_id;
    }
    if (Object.keys(patch).length > 0) {
      const { error: docErr } = await auth.supabase
        .from("documents")
        .update(patch)
        .eq("id", parsed.data.source_document_id);
      if (docErr) {
        return {
          ok: false,
          message: `פריט המלאי נשמר, אבל עדכון המסמך נכשל: ${toHebrewError(docErr)}`,
        };
      }
    }
    revalidatePath("/dashboard/documents");
    revalidatePath(`/dashboard/documents/${parsed.data.source_document_id}`);
  }

  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/new");
  revalidatePath("/dashboard");
  if (parsed.data.supplier_id) {
    revalidatePath(`/dashboard/suppliers/${parsed.data.supplier_id}`);
  }
  return { ok: true, id: inserted.id as string };
}

const updateInventorySchema = inventoryBaseSchema.extend({
  id: z.string().uuid(),
});

export async function updateInventoryItem(
  formData: FormData
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const status = formData.get("status") as string;
  const expectedRaw = formData.get("expected_arrival_date");
  const pricingUnit = formData.get("pricing_unit") as string;

  const parsed = updateInventorySchema.safeParse({
    id: formData.get("id"),
    stone_id: formData.get("stone_id"),
    length_m: formData.get("length_m"),
    width_m: formData.get("width_m"),
    height_m: formData.get("height_m"),
    quantity_total: formData.get("quantity_total"),
    pricing_unit: pricingUnit === "m2" ? "m2" : "m3",
    price_per_m3:
      pricingUnit === "m3" ? formData.get("price_per_m3") : undefined,
    price_per_m2:
      pricingUnit === "m2" ? formData.get("price_per_m2") : undefined,
    customer_price: formData.get("customer_price"),
    status,
    finish_level: formData.get("finish_level"),
    piece_type: formData.get("piece_type"),
    expected_arrival_date:
      expectedRaw && String(expectedRaw).length > 0
        ? String(expectedRaw)
        : null,
    supplier_id: formData.get("supplier_id"),
    source_document_id: null,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  if (
    parsed.data.status === "in_transit" &&
    !parsed.data.expected_arrival_date
  ) {
    return {
      ok: false,
      message: "בסטטוס ״בדרך״ חובה תאריך צפי הגעה",
    };
  }

  const pricing = resolveInventoryPricing(parsed.data);
  if ("error" in pricing) {
    return { ok: false, message: pricing.error };
  }

  const { data: existing, error: fetchErr } = await auth.supabase
    .from("inventory_items")
    .select("quantity_reserved, quantity_delivered, stone_id, supplier_id")
    .eq("id", parsed.data.id)
    .single();

  if (fetchErr || !existing) {
    return { ok: false, message: toHebrewError(fetchErr, "לא נמצא מלאי") };
  }

  if (existing.stone_id !== parsed.data.stone_id) {
    return { ok: false, message: "לא ניתן לשנות את האבן למשלוח קיים" };
  }

  const minTotal =
    (existing.quantity_reserved as number) +
    (existing.quantity_delivered as number);
  if (parsed.data.quantity_total < minTotal) {
    return {
      ok: false,
      message: `כמות כוללת לא יכולה להיות קטנה מהכמות המזומנת/סופקה (${minTotal})`,
    };
  }

  const { error } = await auth.supabase
    .from("inventory_items")
    .update({
      length_m: parsed.data.length_m,
      width_m: parsed.data.width_m,
      height_m: parsed.data.height_m,
      quantity_total: parsed.data.quantity_total,
      pricing_unit: pricing.pricing_unit,
      price_per_m2: pricing.price_per_m2,
      price_per_m3: pricing.price_per_m3,
      customer_price: pricing.customer_price,
      status: parsed.data.status,
      finish_level: parsed.data.finish_level,
      piece_type: parsed.data.piece_type,
      expected_arrival_date:
        parsed.data.status === "in_transit"
          ? parsed.data.expected_arrival_date
          : null,
      supplier_id: parsed.data.supplier_id,
    })
    .eq("id", parsed.data.id);

  if (error) return { ok: false, message: toHebrewError(error) };

  revalidatePath("/dashboard/inventory");
  revalidatePath(`/dashboard/inventory/${parsed.data.id}/edit`);
  revalidatePath("/dashboard");
  for (const sid of new Set([existing.supplier_id as string | null, parsed.data.supplier_id])) {
    if (sid) revalidatePath(`/dashboard/suppliers/${sid}`);
  }
  return { ok: true };
}

export async function deleteInventoryItem(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "מזהה לא תקין" };

  const { count, error: cntErr } = await auth.supabase
    .from("order_items")
    .select("*", { count: "exact", head: true })
    .eq("inventory_item_id", parsed.data);

  if (cntErr) return { ok: false, message: toHebrewError(cntErr) };
  if ((count ?? 0) > 0) {
    const { error } = await auth.supabase
      .from("inventory_items")
      .update({ status: "unavailable" })
      .eq("id", parsed.data);
    if (error) return { ok: false, message: toHebrewError(error) };
    revalidatePath("/dashboard/inventory");
    return { ok: true };
  }

  const { error } = await auth.supabase
    .from("inventory_items")
    .delete()
    .eq("id", parsed.data);

  if (error) return { ok: false, message: toHebrewError(error) };

  revalidatePath("/dashboard/inventory");
  return { ok: true };
}
