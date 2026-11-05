"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/zod-he";

import { toHebrewError } from "@/lib/db/errors";
import { optionalDateSchema } from "@/lib/db/validation";
import { requireAdmin, requireAuth } from "@/lib/supabase/auth-helpers";
import type {
  ExpenseCategoryDb,
  ExpenseDocumentTypeDb,
  PaymentMethodDb,
} from "@/lib/db/types";

export type ExpenseActionResult =
  | { ok: true; id: string }
  | {
      ok: false;
      message: string;
      /** כשנחסמה כפילות — ההוצאה הקיימת */
      existingId?: string;
    };

export type SimpleActionResult = { ok: true } | { ok: false; message: string };

/** הקלט מהטופס — מספרים כבר מנורמלים (normalizeDecimalInput) כמחרוזות */
export type ExpenseInput = {
  supplier_id: string | null;
  category: ExpenseCategoryDb;
  description: string | null;
  expense_date: string;
  /** YYYY-MM */
  reporting_month: string | null;
  document_type: ExpenseDocumentTypeDb;
  document_number: string | null;
  amount_before_vat: string | null;
  vat_amount: string | null;
  amount_total: string;
  currency: string;
  is_paid: boolean;
  paid_at: string | null;
  payment_method: PaymentMethodDb | null;
  notes: string | null;
  document_id: string | null;
};

const emptyToNull = (v: unknown) =>
  v == null || (typeof v === "string" && v.trim() === "") ? null : v;

const optionalMoney = z.preprocess(
  emptyToNull,
  z.coerce
    .number({ error: "סכום לא תקין" })
    .refine((n) => Number.isFinite(n), "סכום לא תקין")
    .nonnegative("סכום לא יכול להיות שלילי")
    .nullable()
);

const expenseSchema = z
  .object({
    supplier_id: z.preprocess(emptyToNull, z.string().uuid("ספק לא תקין").nullable()),
    category: z.enum(
      [
        "stone_purchase",
        "transport",
        "fuel",
        "vehicle",
        "maintenance",
        "rent",
        "salaries",
        "office",
        "tools",
        "professional_services",
        "taxes_fees",
        "marketing",
        "other",
      ],
      { error: "יש לבחור קטגוריה" }
    ),
    description: z.preprocess(emptyToNull, z.string().trim().max(500).nullable()),
    expense_date: z
      .string({ error: "יש למלא תאריך הוצאה" })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "יש למלא תאריך הוצאה תקין"),
    reporting_month: z.preprocess(
      emptyToNull,
      z.string().regex(/^\d{4}-\d{2}$/, "חודש דיווח לא תקין").nullable()
    ),
    document_type: z.coerce
      .number()
      .refine((n) => [20, 305, 320, 330, 400, 405].includes(n), "סוג מסמך לא תקין"),
    document_number: z.preprocess(
      emptyToNull,
      z.string().trim().max(60, "מספר מסמך ארוך מדי").nullable()
    ),
    amount_before_vat: optionalMoney,
    vat_amount: optionalMoney,
    amount_total: z.preprocess(
      (v) => (v == null || (typeof v === "string" && v.trim() === "") ? undefined : v),
      z.coerce
        .number({ error: "יש למלא סכום כולל (כולל מע״מ)" })
        .refine((n) => Number.isFinite(n), "יש למלא סכום כולל (כולל מע״מ) תקין")
        .nonnegative("סכום לא יכול להיות שלילי")
    ),
    currency: z
      .string()
      .trim()
      .transform((s) => s.toUpperCase())
      .pipe(z.string().regex(/^[A-Z]{3}$/, "קוד מטבע לא תקין (למשל ILS)")),
    is_paid: z.boolean(),
    paid_at: optionalDateSchema,
    payment_method: z.preprocess(
      emptyToNull,
      z.enum(["cash", "bank_transfer", "check", "credit_card", "other"]).nullable()
    ),
    notes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
    document_id: z.preprocess(emptyToNull, z.string().uuid().nullable()),
  })
  .superRefine((d, ctx) => {
    if (d.amount_before_vat != null && d.vat_amount != null) {
      const diff = Math.abs(d.amount_before_vat + d.vat_amount - d.amount_total);
      if (diff > 0.05) {
        ctx.addIssue({
          code: "custom",
          path: ["amount_total"],
          message: `הסכומים לא מסתדרים: לפני מע״מ + מע״מ = ${(
            d.amount_before_vat + d.vat_amount
          ).toFixed(2)}, אבל הסכום הכולל הוא ${d.amount_total.toFixed(2)}`,
        });
      }
    }
  });

type Parsed = z.infer<typeof expenseSchema>;
type Supa = Extract<Awaited<ReturnType<typeof requireAuth>>, { ok: true }>["supabase"];

function toRow(d: Parsed) {
  const reportingMonth = d.reporting_month ?? d.expense_date.slice(0, 7);
  return {
    supplier_id: d.supplier_id,
    category: d.category,
    description: d.description,
    expense_date: d.expense_date,
    reporting_month: `${reportingMonth}-01`,
    document_type: d.document_type,
    document_number: d.document_number,
    amount_before_vat: d.amount_before_vat,
    vat_amount: d.vat_amount,
    amount_total: d.amount_total,
    currency: d.currency,
    is_paid: d.is_paid,
    paid_at: d.is_paid ? (d.paid_at ?? d.expense_date) : null,
    payment_method: d.is_paid ? d.payment_method : null,
    notes: d.notes,
  };
}

/** כפילות: אותו ספק + אותו מספר מסמך. */
async function findDuplicateExpense(
  supabase: Supa,
  d: Parsed,
  excludeId?: string
): Promise<string | null> {
  if (!d.supplier_id || !d.document_number) return null;
  let q = supabase
    .from("expenses")
    .select("id")
    .eq("supplier_id", d.supplier_id)
    .eq("document_number", d.document_number);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q.limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}

/** מסמך מקור: בודק שקיים ושאינו מקושר כבר להוצאה אחרת. */
async function checkSourceDocument(
  supabase: Supa,
  documentId: string,
  expenseId?: string
): Promise<{ ok: true } | { ok: false; message: string; existingId?: string }> {
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, expense_id, status")
    .eq("id", documentId)
    .maybeSingle();
  if (error) return { ok: false, message: toHebrewError(error) };
  if (!doc) return { ok: false, message: "המסמך המקושר לא נמצא — ייתכן שנמחק." };
  if (doc.status === "rejected") {
    return { ok: false, message: "המסמך המקושר סומן כ״נדחה״ — לא ניתן לרשום ממנו הוצאה." };
  }
  if (doc.expense_id && doc.expense_id !== expenseId) {
    return {
      ok: false,
      message: "המסמך הזה כבר נרשם כהוצאה.",
      existingId: doc.expense_id as string,
    };
  }
  return { ok: true };
}

/** מקשר מסמך להוצאה ומסמן אותו "טופל" (לפי החוזה: documents.expense_id + status). */
async function linkDocument(
  supabase: Supa,
  userId: string,
  documentId: string,
  expenseId: string,
  supplierId: string | null
) {
  const { data: doc } = await supabase
    .from("documents")
    .select("status, supplier_id")
    .eq("id", documentId)
    .maybeSingle();
  const patch: Record<string, unknown> = { expense_id: expenseId };
  if (doc?.status === "pending_review") {
    patch.status = "processed";
    patch.reviewed_by = userId;
    patch.reviewed_at = new Date().toISOString();
  }
  if (!doc?.supplier_id && supplierId) patch.supplier_id = supplierId;
  return supabase.from("documents").update(patch).eq("id", documentId);
}

function revalidateExpensePaths(id?: string, supplierId?: string | null, documentId?: string | null) {
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/suppliers");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/dashboard/expenses/${id}`);
  if (supplierId) revalidatePath(`/dashboard/suppliers/${supplierId}`);
  if (documentId) {
    revalidatePath("/dashboard/documents");
    revalidatePath(`/dashboard/documents/${documentId}`);
  }
}

export async function createExpense(input: ExpenseInput): Promise<ExpenseActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה" };
  }
  const d = parsed.data;

  const dupId = await findDuplicateExpense(auth.supabase, d);
  if (dupId) {
    return {
      ok: false,
      message: "הוצאה עם מספר מסמך זה כבר נרשמה לספק הזה.",
      existingId: dupId,
    };
  }

  if (d.document_id) {
    const docCheck = await checkSourceDocument(auth.supabase, d.document_id);
    if (!docCheck.ok) return docCheck;
  }

  const { data: row, error } = await auth.supabase
    .from("expenses")
    .insert({ ...toRow(d), document_id: d.document_id })
    .select("id")
    .single();

  if (error || !row) return { ok: false, message: toHebrewError(error) };
  const id = row.id as string;

  if (d.document_id) {
    const { error: linkErr } = await linkDocument(
      auth.supabase,
      auth.userId,
      d.document_id,
      id,
      d.supplier_id
    );
    if (linkErr) {
      revalidateExpensePaths(id, d.supplier_id, d.document_id);
      return {
        ok: false,
        message: `ההוצאה נשמרה, אבל קישור המסמך נכשל: ${toHebrewError(linkErr)}`,
        existingId: id,
      };
    }
  }

  revalidateExpensePaths(id, d.supplier_id, d.document_id);
  return { ok: true, id };
}

export async function updateExpense(
  id: string,
  input: ExpenseInput
): Promise<ExpenseActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) return { ok: false, message: "מזהה לא תקין" };

  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה" };
  }
  const d = parsed.data;

  const { data: current, error: curErr } = await auth.supabase
    .from("expenses")
    .select("id, document_id, supplier_id")
    .eq("id", idParsed.data)
    .maybeSingle();
  if (curErr) return { ok: false, message: toHebrewError(curErr) };
  if (!current) return { ok: false, message: "ההוצאה לא נמצאה — ייתכן שנמחקה." };

  const dupId = await findDuplicateExpense(auth.supabase, d, idParsed.data);
  if (dupId) {
    return {
      ok: false,
      message: "הוצאה עם מספר מסמך זה כבר נרשמה לספק הזה.",
      existingId: dupId,
    };
  }

  // מסמך מקושר לא משתנה מהעריכה (אלא אם לא היה מסמך קודם)
  const documentId = (current.document_id as string | null) ?? d.document_id;
  if (documentId && documentId !== current.document_id) {
    const docCheck = await checkSourceDocument(auth.supabase, documentId, idParsed.data);
    if (!docCheck.ok) return docCheck;
  }

  const { error } = await auth.supabase
    .from("expenses")
    .update({ ...toRow(d), document_id: documentId })
    .eq("id", idParsed.data);

  if (error) return { ok: false, message: toHebrewError(error) };

  if (documentId && documentId !== current.document_id) {
    await linkDocument(auth.supabase, auth.userId, documentId, idParsed.data, d.supplier_id);
  }

  revalidateExpensePaths(idParsed.data, d.supplier_id, documentId);
  if (current.supplier_id && current.supplier_id !== d.supplier_id) {
    revalidatePath(`/dashboard/suppliers/${current.supplier_id}`);
  }
  return { ok: true, id: idParsed.data };
}

/** מחיקה — מנהל בלבד. המסמך המקושר נשאר (expense_id מתאפס ב-DB). */
export async function deleteExpense(id: string): Promise<SimpleActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "מזהה לא תקין" };

  const { data: deleted, error } = await auth.supabase
    .from("expenses")
    .delete()
    .eq("id", parsed.data)
    .select("id, supplier_id, document_id");

  if (error) return { ok: false, message: toHebrewError(error) };
  if (!deleted || deleted.length === 0) {
    return { ok: false, message: "ההוצאה לא נמחקה — ייתכן שכבר נמחקה או שאין הרשאה." };
  }

  const row = deleted[0];
  revalidateExpensePaths(
    undefined,
    row.supplier_id as string | null,
    row.document_id as string | null
  );
  return { ok: true };
}
