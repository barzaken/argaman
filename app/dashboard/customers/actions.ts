"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAuth } from "@/lib/supabase/auth-helpers";

export type ActionResult =
  | { ok: true }
  | { ok: false; message: string };

const customerSchema = z.object({
  name: z.string().min(1, "שם חובה"),
  tax_id: z.string().min(1, "ח.פ / ת״ז חובה"),
  email: z.preprocess(
    (v) =>
      typeof v === "string" && v.trim() === "" ? undefined : v,
    z.string().email("אימייל לא תקין").optional()
  ),
  phone: z.preprocess(
    (v) =>
      typeof v === "string" && v.trim() === "" ? undefined : v,
    z.string().optional()
  ),
  address: z.preprocess(
    (v) =>
      typeof v === "string" && v.trim() === "" ? undefined : v,
    z.string().optional()
  ),
});

export async function createCustomer(formData: FormData): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = customerSchema.safeParse({
    name: formData.get("name"),
    tax_id: formData.get("tax_id"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  const { error } = await auth.supabase.from("customers").insert({
    name: parsed.data.name.trim(),
    tax_id: parsed.data.tax_id.trim(),
    email: parsed.data.email ?? null,
    phone: parsed.data.phone?.trim() || null,
    address: parsed.data.address?.trim() || null,
    is_active: true,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard");
  return { ok: true };
}

const updateCustomerSchema = customerSchema.extend({
  id: z.string().uuid(),
});

export async function updateCustomer(formData: FormData): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = updateCustomerSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    tax_id: formData.get("tax_id"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  const { error } = await auth.supabase
    .from("customers")
    .update({
      name: parsed.data.name.trim(),
      tax_id: parsed.data.tax_id.trim(),
      email: parsed.data.email ?? null,
      phone: parsed.data.phone?.trim() || null,
      address: parsed.data.address?.trim() || null,
    })
    .eq("id", parsed.data.id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/${parsed.data.id}`);
  revalidatePath(`/dashboard/customers/${parsed.data.id}/edit`);
  return { ok: true };
}

export async function archiveCustomer(id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "מזהה לא תקין" };

  const { error } = await auth.supabase
    .from("customers")
    .update({ is_active: false })
    .eq("id", parsed.data);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/customers");
  return { ok: true };
}

const priceOverrideSchema = z.object({
  customer_id: z.string().uuid(),
  stone_id: z.string().uuid(),
  price_per_m3: z.coerce.number().positive(),
});

export async function upsertCustomerStonePrice(
  formData: FormData
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = priceOverrideSchema.safeParse({
    customer_id: formData.get("customer_id"),
    stone_id: formData.get("stone_id"),
    price_per_m3: formData.get("price_per_m3"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  const { error } = await auth.supabase.from("customer_stone_prices").upsert(
    {
      customer_id: parsed.data.customer_id,
      stone_id: parsed.data.stone_id,
      price_per_m3: parsed.data.price_per_m3,
    },
    { onConflict: "customer_id,stone_id" }
  );

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/dashboard/customers/${parsed.data.customer_id}`);
  return { ok: true };
}

export async function deleteCustomerStonePrice(
  customerId: string,
  rowId: string
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const idParsed = z.string().uuid().safeParse(rowId);
  if (!idParsed.success) return { ok: false, message: "מזהה לא תקין" };

  const { error } = await auth.supabase
    .from("customer_stone_prices")
    .delete()
    .eq("id", idParsed.data)
    .eq("customer_id", customerId);

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/dashboard/customers/${customerId}`);
  return { ok: true };
}
