"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAuth } from "@/lib/supabase/auth-helpers";

export type ActionResult =
  | { ok: true }
  | { ok: false; message: string };

const inventorySchema = z.object({
  stone_id: z.string().uuid(),
  length_m: z.coerce.number().positive(),
  width_m: z.coerce.number().positive(),
  height_m: z.coerce.number().positive(),
  quantity_total: z.coerce.number().int().positive(),
  price_per_m3: z.coerce.number().nonnegative(),
  customer_price: z.coerce.number().nonnegative(),
  status: z.enum(["available", "unavailable", "in_transit"]),
  expected_arrival_date: z.string().optional().nullable(),
});

export async function createInventoryItem(
  formData: FormData
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const status = formData.get("status") as string;
  const expectedRaw = formData.get("expected_arrival_date");

  const parsed = inventorySchema.safeParse({
    stone_id: formData.get("stone_id"),
    length_m: formData.get("length_m"),
    width_m: formData.get("width_m"),
    height_m: formData.get("height_m"),
    quantity_total: formData.get("quantity_total"),
    price_per_m3: formData.get("price_per_m3"),
    customer_price: formData.get("customer_price"),
    status,
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

  const insertPayload = {
    stone_id: parsed.data.stone_id,
    length_m: parsed.data.length_m,
    width_m: parsed.data.width_m,
    height_m: parsed.data.height_m,
    quantity_total: parsed.data.quantity_total,
    price_per_m3: parsed.data.price_per_m3,
    customer_price: parsed.data.customer_price,
    status: parsed.data.status,
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
  revalidatePath("/dashboard");
  return { ok: true };
}

const updateInventorySchema = inventorySchema.extend({
  id: z.string().uuid(),
});

export async function updateInventoryItem(
  formData: FormData
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const status = formData.get("status") as string;
  const expectedRaw = formData.get("expected_arrival_date");

  const parsed = updateInventorySchema.safeParse({
    id: formData.get("id"),
    stone_id: formData.get("stone_id"),
    length_m: formData.get("length_m"),
    width_m: formData.get("width_m"),
    height_m: formData.get("height_m"),
    quantity_total: formData.get("quantity_total"),
    price_per_m3: formData.get("price_per_m3"),
    customer_price: formData.get("customer_price"),
    status,
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

  const { data: existing, error: fetchErr } = await auth.supabase
    .from("inventory_items")
    .select(
      "quantity_reserved, quantity_delivered, stone_id"
    )
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
      price_per_m3: parsed.data.price_per_m3,
      customer_price: parsed.data.customer_price,
      status: parsed.data.status,
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
