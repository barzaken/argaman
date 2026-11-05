"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/zod-he";

import { toHebrewError } from "@/lib/db/errors";
import { requireAdmin, requireAuth } from "@/lib/supabase/auth-helpers";

export type SupplierActionResult =
  | { ok: true; id: string }
  | {
      ok: false;
      message: string;
      /** כשנחסמה כפילות — הספק הקיים (לקישור "לספק הקיים") */
      existing?: { id: string; name: string };
    };

export type SimpleActionResult = { ok: true } | { ok: false; message: string };

export type SupplierInput = {
  name: string;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

const supplierSchema = z.object({
  name: z.string().trim().min(1, "יש למלא שם ספק").max(200, "שם ארוך מדי"),
  tax_id: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .transform((s) => s.replace(/[\s-]/g, "").toUpperCase())
      .pipe(z.string().regex(/^[0-9A-Za-z]{4,20}$/, "ח.פ / ע.מ לא תקין — ספרות בלבד, בלי רווחים"))
      .nullable()
      .optional()
  ),
  phone: z.preprocess(emptyToNull, z.string().trim().max(40).nullable().optional()),
  email: z.preprocess(
    emptyToNull,
    z.string().trim().email("אימייל לא תקין").nullable().optional()
  ),
  address: z.preprocess(emptyToNull, z.string().trim().max(300).nullable().optional()),
  notes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable().optional()),
});

type Supa = Extract<Awaited<ReturnType<typeof requireAuth>>, { ok: true }>["supabase"];

/** ilike בלי תווים כלליים — השוואת שם מדויקת בלי תלות באותיות גדולות/קטנות */
function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** בודק כפילות לפני שמירה: אותו ח.פ, או (כשאין ח.פ) אותו שם בדיוק. */
async function findDuplicateSupplier(
  supabase: Supa,
  data: { name: string; tax_id?: string | null },
  excludeId?: string
): Promise<{ id: string; name: string; reason: "tax_id" | "name" } | null> {
  if (data.tax_id) {
    let q = supabase.from("suppliers").select("id, name").eq("tax_id", data.tax_id);
    if (excludeId) q = q.neq("id", excludeId);
    const { data: rows } = await q.limit(1);
    const hit = rows?.[0];
    if (hit) return { id: hit.id as string, name: hit.name as string, reason: "tax_id" };
  }
  let q = supabase
    .from("suppliers")
    .select("id, name, tax_id")
    .ilike("name", escapeLike(data.name.trim()));
  if (excludeId) q = q.neq("id", excludeId);
  const { data: rows } = await q.limit(5);
  // שם זהה עם ח.פ שונה — ספקים שונים בשם זהה (נדיר), לא חוסמים
  const hit = (rows ?? []).find(
    (r) => !data.tax_id || !r.tax_id || r.tax_id === data.tax_id
  );
  if (hit) return { id: hit.id as string, name: hit.name as string, reason: "name" };
  return null;
}

function duplicateMessage(dup: { name: string; reason: "tax_id" | "name" }) {
  return dup.reason === "tax_id"
    ? `כבר קיים ספק עם ח.פ / ע.מ זה: ${dup.name}`
    : `כבר קיים ספק בשם זה: ${dup.name}`;
}

function revalidateSupplierPaths(id?: string) {
  revalidatePath("/dashboard/suppliers");
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/expenses/new");
  revalidatePath("/dashboard/inventory/new");
  if (id) revalidatePath(`/dashboard/suppliers/${id}`);
}

export async function createSupplier(
  input: SupplierInput
): Promise<SupplierActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה" };
  }

  const dup = await findDuplicateSupplier(auth.supabase, parsed.data);
  if (dup) {
    return {
      ok: false,
      message: duplicateMessage(dup),
      existing: { id: dup.id, name: dup.name },
    };
  }

  const { data: row, error } = await auth.supabase
    .from("suppliers")
    .insert({
      name: parsed.data.name,
      tax_id: parsed.data.tax_id ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      address: parsed.data.address ?? null,
      notes: parsed.data.notes ?? null,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !row) return { ok: false, message: toHebrewError(error) };

  revalidateSupplierPaths(row.id as string);
  return { ok: true, id: row.id as string };
}

export async function updateSupplier(
  id: string,
  input: SupplierInput
): Promise<SupplierActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) return { ok: false, message: "מזהה לא תקין" };

  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה" };
  }

  const dup = await findDuplicateSupplier(auth.supabase, parsed.data, idParsed.data);
  if (dup) {
    return {
      ok: false,
      message: duplicateMessage(dup),
      existing: { id: dup.id, name: dup.name },
    };
  }

  const { error } = await auth.supabase
    .from("suppliers")
    .update({
      name: parsed.data.name,
      tax_id: parsed.data.tax_id ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      address: parsed.data.address ?? null,
      notes: parsed.data.notes ?? null,
    })
    .eq("id", idParsed.data);

  if (error) return { ok: false, message: toHebrewError(error) };

  revalidateSupplierPaths(idParsed.data);
  revalidatePath(`/dashboard/suppliers/${idParsed.data}/edit`);
  return { ok: true, id: idParsed.data };
}

/** העברה לארכיון / החזרה מארכיון (is_active) */
export async function setSupplierActive(
  id: string,
  active: boolean
): Promise<SimpleActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "מזהה לא תקין" };

  const { error } = await auth.supabase
    .from("suppliers")
    .update({ is_active: active })
    .eq("id", parsed.data);

  if (error) return { ok: false, message: toHebrewError(error) };

  revalidateSupplierPaths(parsed.data);
  return { ok: true };
}

/** מחיקה — מנהל בלבד, ורק לספק שאין לו הוצאות / מלאי / מסמכים. */
export async function deleteSupplier(id: string): Promise<SimpleActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "מזהה לא תקין" };

  const [exp, inv, docs] = await Promise.all([
    auth.supabase
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", parsed.data),
    auth.supabase
      .from("inventory_items")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", parsed.data),
    auth.supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", parsed.data),
  ]);
  const firstErr = exp.error ?? inv.error ?? docs.error;
  if (firstErr) return { ok: false, message: toHebrewError(firstErr) };
  if ((exp.count ?? 0) + (inv.count ?? 0) + (docs.count ?? 0) > 0) {
    return {
      ok: false,
      message:
        "לא ניתן למחוק ספק שיש לו הוצאות, מלאי או מסמכים — אפשר להעביר אותו לארכיון.",
    };
  }

  const { data: deleted, error } = await auth.supabase
    .from("suppliers")
    .delete()
    .eq("id", parsed.data)
    .select("id");

  if (error) return { ok: false, message: toHebrewError(error) };
  if (!deleted || deleted.length === 0) {
    return { ok: false, message: "הספק לא נמחק — ייתכן שכבר נמחק או שאין הרשאה." };
  }

  revalidateSupplierPaths();
  return { ok: true };
}
