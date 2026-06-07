"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { derivePricePerM3FromM2 } from "@/lib/db/calculations";
import { requireAuth } from "@/lib/supabase/auth-helpers";

export type ActionResult =
  | { ok: true }
  | { ok: false; message: string };

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
  piece_type: z.enum(["panel", "frame", "plate"]),
  expected_arrival_date: z.string().optional().nullable(),
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
  });
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

  const insertPayload = {
    stone_id: parsed.data.stone_id,
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

  const { error } = await auth.supabase
    .from("inventory_items")
    .insert(insertPayload);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/new");
  revalidatePath("/dashboard");
  return { ok: true };
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
    .select("quantity_reserved, quantity_delivered, stone_id")
    .eq("id", parsed.data.id)
    .single();

  if (fetchErr || !existing) {
    return { ok: false, message: fetchErr?.message ?? "לא נמצא מלאי" };
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
    })
    .eq("id", parsed.data.id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/inventory");
  revalidatePath(`/dashboard/inventory/${parsed.data.id}/edit`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteInventoryItem(id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "מזהה לא תקין" };

  const { count, error: cntErr } = await auth.supabase
    .from("order_items")
    .select("*", { count: "exact", head: true })
    .eq("inventory_item_id", parsed.data);

  if (cntErr) return { ok: false, message: cntErr.message };
  if ((count ?? 0) > 0) {
    const { error } = await auth.supabase
      .from("inventory_items")
      .update({ status: "unavailable" })
      .eq("id", parsed.data);
    if (error) return { ok: false, message: error.message };
    revalidatePath("/dashboard/inventory");
    return { ok: true };
  }

  const { error } = await auth.supabase
    .from("inventory_items")
    .delete()
    .eq("id", parsed.data);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/inventory");
  return { ok: true };
}
