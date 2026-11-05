"use server";

import { revalidatePath } from "next/cache";

import { z } from "@/lib/zod-he";
import { toHebrewError } from "@/lib/db/errors";
import { optionalDateSchema } from "@/lib/db/validation";
import { requireAdmin, requireAuth } from "@/lib/supabase/auth-helpers";
import type { DocumentKindDb, DocumentStatusDb } from "@/lib/db/types";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; message: string; duplicateId?: string };

const DOCUMENT_KINDS = [
  "customer_invoice",
  "customer_invoice_receipt",
  "customer_receipt",
  "customer_credit_note",
  "supplier_invoice",
  "supplier_receipt",
  "supplier_delivery_note",
  "expense_receipt",
  "signed_delivery_note",
  "other",
] as const satisfies readonly DocumentKindDb[];

const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export type DuplicateDocument = {
  id: string;
  document_number: string | null;
  document_date: string | null;
  counterparty_name: string | null;
  status: DocumentStatusDb;
};

const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

const optionalText = (max: number) =>
  z.preprocess(
    emptyToNull,
    z.string().trim().max(max, "הטקסט ארוך מדי").nullable().optional()
  );

const optionalUuid = z.preprocess(
  emptyToNull,
  z.string().uuid("מזהה לא תקין").nullable().optional()
);

const optionalMoney = (label: string) =>
  z.preprocess(
    (v) => {
      if (v === null || v === undefined) return null;
      if (typeof v === "string") {
        const t = v.trim();
        if (t === "") return null;
        return Number(t);
      }
      return v;
    },
    z
      .number({ error: `${label}: יש להזין מספר` })
      .finite(`${label}: יש להזין מספר`)
      .nullable()
      .optional()
  );

const DUPLICATE_MESSAGE = "המסמך כבר הוזן במערכת (אותו סוג, ח.פ ומספר)";

const fieldsSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS, { error: "יש לבחור סוג מסמך" }),
  document_number: optionalText(80),
  document_date: optionalDateSchema,
  due_date: optionalDateSchema,
  counterparty_name: optionalText(200),
  counterparty_tax_id: optionalText(40),
  amount_before_vat: optionalMoney("סכום לפני מע״מ"),
  vat_amount: optionalMoney("מע״מ"),
  amount_total: optionalMoney("סכום כולל"),
  currency: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim().toUpperCase() : "ILS"),
    z.string().regex(/^[A-Z]{3}$/, "קוד מטבע לא תקין (למשל ILS)")
  ),
  notes: optionalText(4000),
  customer_id: optionalUuid,
  supplier_id: optionalUuid,
  order_id: optionalUuid,
  delivery_id: optionalUuid,
  payment_id: optionalUuid,
  expense_id: optionalUuid,
  source: z.enum(["upload", "whatsapp"], { error: "מקור המסמך אינו תקין." }).default("upload"),
});

const fileSchema = z.object({
  storage_path: z
    .string()
    .min(3)
    .max(400)
    .refine(
      (p) => !p.startsWith("/") && !p.includes(".."),
      "נתיב קובץ לא תקין"
    ),
  file_name: z.string().trim().min(1).max(255),
  mime_type: z
    .string()
    .refine((m) => ALLOWED_MIME.includes(m), "סוג קובץ לא נתמך — אפשר להעלות תמונה (JPG/PNG/WEBP/HEIC) או PDF."),
  file_size: z
    .number()
    .int()
    .positive()
    .max(MAX_FILE_SIZE, "הקובץ גדול מדי (עד 20MB)."),
});

const createSchema = fieldsSchema.extend({
  file: fileSchema.nullable().optional(),
  extracted: z.record(z.string(), z.unknown()).nullable().optional(),
});

const updateSchema = fieldsSchema.extend({
  id: z.string().uuid("מזהה לא תקין"),
  /** קובץ חדש שהועלה במקום הקיים (אופציונלי) */
  file: fileSchema.nullable().optional(),
});

export type DocumentFieldsInput = z.input<typeof fieldsSchema>;
export type DocumentFileInput = z.input<typeof fileSchema>;

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? "שגיאת ולידציה";
}

function revalidateDocumentPaths(row: {
  id?: string;
  customer_id?: string | null;
  supplier_id?: string | null;
  order_id?: string | null;
  delivery_id?: string | null;
  payment_id?: string | null;
  expense_id?: string | null;
}) {
  revalidatePath("/dashboard/documents");
  if (row.id) {
    revalidatePath(`/dashboard/documents/${row.id}`);
    revalidatePath(`/dashboard/documents/${row.id}/edit`);
  }
  revalidatePath("/dashboard");
  if (row.customer_id) revalidatePath(`/dashboard/customers/${row.customer_id}`);
  if (row.supplier_id) revalidatePath(`/dashboard/suppliers/${row.supplier_id}`);
  if (row.order_id) revalidatePath(`/dashboard/orders/${row.order_id}`);
  if (row.delivery_id) revalidatePath(`/dashboard/deliveries/${row.delivery_id}`);
  if (row.payment_id) revalidatePath(`/dashboard/payments/${row.payment_id}`);
  if (row.expense_id) revalidatePath(`/dashboard/expenses/${row.expense_id}`);
}

type AuthedSupabase = Extract<Awaited<ReturnType<typeof requireAuth>>, { ok: true }>["supabase"];

/** מחפש מסמך פעיל (לא נדחה) עם אותו סוג + ח.פ + מספר — כמו האינדקס הייחודי במסד. */
async function lookupDuplicate(
  supabase: AuthedSupabase,
  args: {
    kind: DocumentKindDb;
    document_number?: string | null;
    counterparty_tax_id?: string | null;
    excludeId?: string;
  }
): Promise<{ ok: true; duplicate: DuplicateDocument | null } | { ok: false; message: string }> {
  const number = args.document_number?.trim();
  if (!number) return { ok: true, duplicate: null };
  const taxId = args.counterparty_tax_id?.trim() || null;

  let q = supabase
    .from("documents")
    .select("id, document_number, document_date, counterparty_name, status, counterparty_tax_id")
    .eq("kind", args.kind)
    .eq("document_number", number)
    .neq("status", "rejected")
    .limit(5);
  q = taxId ? q.eq("counterparty_tax_id", taxId) : q.is("counterparty_tax_id", null);

  const { data, error } = await q;
  if (error) return { ok: false, message: toHebrewError(error) };

  let rows = (data ?? []) as (DuplicateDocument & { counterparty_tax_id: string | null })[];
  // ח.פ ריק נשמר כ-null, אבל גם '' נחשב זהה (coalesce במסד)
  if (!taxId && rows.length === 0) {
    const { data: blank } = await supabase
      .from("documents")
      .select("id, document_number, document_date, counterparty_name, status, counterparty_tax_id")
      .eq("kind", args.kind)
      .eq("document_number", number)
      .eq("counterparty_tax_id", "")
      .neq("status", "rejected")
      .limit(5);
    rows = (blank ?? []) as typeof rows;
  }
  const dup = rows.find((r) => r.id !== args.excludeId) ?? null;
  return {
    ok: true,
    duplicate: dup
      ? {
          id: dup.id,
          document_number: dup.document_number,
          document_date: dup.document_date,
          counterparty_name: dup.counterparty_name,
          status: dup.status,
        }
      : null,
  };
}

/** בדיקת כפילות לפני העלאת הקובץ (נקרא מהטופס). */
export async function checkDuplicateDocument(input: {
  kind: string;
  document_number?: string | null;
  counterparty_tax_id?: string | null;
  excludeId?: string | null;
}): Promise<
  | { ok: true; duplicate: DuplicateDocument | null }
  | { ok: false; message: string }
> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const kind = z.enum(DOCUMENT_KINDS).safeParse(input.kind);
  if (!kind.success) return { ok: false, message: "יש לבחור סוג מסמך" };
  const excludeId = input.excludeId
    ? z.string().uuid().safeParse(input.excludeId)
    : null;
  if (excludeId && !excludeId.success) return { ok: false, message: "מזהה לא תקין" };

  return lookupDuplicate(auth.supabase, {
    kind: kind.data,
    document_number: input.document_number,
    counterparty_tax_id: input.counterparty_tax_id,
    excludeId: excludeId?.data,
  });
}

function rowFromFields(d: z.output<typeof fieldsSchema>) {
  return {
    kind: d.kind,
    document_number: d.document_number ?? null,
    document_date: d.document_date ?? null,
    due_date: d.due_date ?? null,
    counterparty_name: d.counterparty_name ?? null,
    counterparty_tax_id: d.counterparty_tax_id ?? null,
    amount_before_vat: d.amount_before_vat ?? null,
    vat_amount: d.vat_amount ?? null,
    amount_total: d.amount_total ?? null,
    currency: d.currency,
    notes: d.notes ?? null,
    customer_id: d.customer_id ?? null,
    supplier_id: d.supplier_id ?? null,
    order_id: d.order_id ?? null,
    delivery_id: d.delivery_id ?? null,
    payment_id: d.payment_id ?? null,
    expense_id: d.expense_id ?? null,
  };
}

/**
 * שומר מסמך חדש. הקובץ כבר הועלה מהדפדפן ל-Storage (bucket "documents");
 * כאן רק נרשמת השורה בטבלה. אם השמירה נכשלת — הדפדפן מנסה למחוק את הקובץ.
 */
export async function createDocument(
  input: z.input<typeof createSchema>
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const d = parsed.data;

  const dup = await lookupDuplicate(auth.supabase, d);
  if (!dup.ok) return dup;
  if (dup.duplicate) {
    return { ok: false, message: DUPLICATE_MESSAGE, duplicateId: dup.duplicate.id };
  }

  const row = {
    ...rowFromFields(d),
    source: d.source,
    storage_path: d.file?.storage_path ?? null,
    file_name: d.file?.file_name ?? null,
    mime_type: d.file?.mime_type ?? null,
    file_size: d.file?.file_size ?? null,
    extracted: d.extracted ?? null,
  };

  const { data, error } = await auth.supabase
    .from("documents")
    .insert(row)
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, message: toHebrewError(error, "שמירת המסמך נכשלה.") };
  }

  revalidateDocumentPaths({ ...row, id: data.id as string });
  return { ok: true, id: data.id as string };
}

/** עדכון שדות מסמך (ואופציונלית החלפת הקובץ). */
export async function updateDocument(
  input: z.input<typeof updateSchema>
): Promise<ActionResult & { oldStoragePath?: string | null }> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const d = parsed.data;

  const { data: existing, error: loadError } = await auth.supabase
    .from("documents")
    .select("id, status, storage_path, source")
    .eq("id", d.id)
    .single();
  if (loadError || !existing) {
    return { ok: false, message: toHebrewError(loadError, "המסמך לא נמצא — ייתכן שנמחק.") };
  }

  if (existing.status !== "rejected") {
    const dup = await lookupDuplicate(auth.supabase, { ...d, excludeId: d.id });
    if (!dup.ok) return dup;
    if (dup.duplicate) {
      return { ok: false, message: DUPLICATE_MESSAGE, duplicateId: dup.duplicate.id };
    }
  }

  const row: Record<string, unknown> = { ...rowFromFields(d) };
  // מקור מערכת (Green Invoice / system) לא משתנה מהטופס
  if (existing.source === "upload" || existing.source === "whatsapp") row.source = d.source;
  if (d.file) {
    row.storage_path = d.file.storage_path;
    row.file_name = d.file.file_name;
    row.mime_type = d.file.mime_type;
    row.file_size = d.file.file_size;
  }

  const { error } = await auth.supabase.from("documents").update(row).eq("id", d.id);
  if (error) return { ok: false, message: toHebrewError(error, "עדכון המסמך נכשל.") };

  // הקובץ הישן הוחלף — מנסים למחוק אותו (מצליח רק למנהל; לסוכן נשאר קובץ יתום)
  const oldPath = existing.storage_path as string | null;
  if (d.file && oldPath && oldPath !== d.file.storage_path && auth.isAdmin) {
    await auth.supabase.storage.from("documents").remove([oldPath]);
  }

  revalidateDocumentPaths({ ...rowFromFields(d), id: d.id });
  return { ok: true, id: d.id };
}

/**
 * שינוי סטטוס: processed (סמן כטופל) | rejected (דחייה, עם סיבה) | pending_review (החזר לבדיקה).
 */
export async function setDocumentStatus(
  id: string,
  status: DocumentStatusDb,
  reason?: string | null
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) return { ok: false, message: "מזהה לא תקין" };
  const statusParsed = z
    .enum(["pending_review", "processed", "rejected"])
    .safeParse(status);
  if (!statusParsed.success) return { ok: false, message: "סטטוס לא תקין" };
  const reasonText = (reason ?? "").trim().slice(0, 1000);

  const { data: doc, error: loadError } = await auth.supabase
    .from("documents")
    .select("id, notes, customer_id, supplier_id, order_id, delivery_id, payment_id, expense_id")
    .eq("id", idParsed.data)
    .single();
  if (loadError || !doc) {
    return { ok: false, message: toHebrewError(loadError, "המסמך לא נמצא — ייתכן שנמחק.") };
  }

  const patch: Record<string, unknown> = { status: statusParsed.data };
  if (statusParsed.data === "pending_review") {
    patch.reviewed_by = null;
    patch.reviewed_at = null;
  } else {
    patch.reviewed_by = auth.userId;
    patch.reviewed_at = new Date().toISOString();
  }
  if (statusParsed.data === "rejected") {
    const line = `סיבת דחייה: ${reasonText || "לא צוינה"}`;
    const prev = (doc.notes as string | null)?.trim();
    patch.notes = prev ? `${prev}\n${line}` : line;
  }

  const { error } = await auth.supabase
    .from("documents")
    .update(patch)
    .eq("id", idParsed.data);
  if (error) return { ok: false, message: toHebrewError(error, "עדכון הסטטוס נכשל.") };

  revalidateDocumentPaths(doc as Parameters<typeof revalidateDocumentPaths>[0]);
  return { ok: true, id: idParsed.data };
}

/** מחיקת מסמך + הקובץ שלו. מנהל בלבד. */
export async function deleteDocument(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) return { ok: false, message: "מזהה לא תקין" };

  const { data: doc, error: loadError } = await auth.supabase
    .from("documents")
    .select("id, storage_path, customer_id, supplier_id, order_id, delivery_id, payment_id, expense_id")
    .eq("id", idParsed.data)
    .single();
  if (loadError || !doc) {
    return { ok: false, message: toHebrewError(loadError, "המסמך לא נמצא — ייתכן שנמחק.") };
  }

  const { error } = await auth.supabase
    .from("documents")
    .delete()
    .eq("id", idParsed.data);
  if (error) return { ok: false, message: toHebrewError(error, "מחיקת המסמך נכשלה.") };

  if (doc.storage_path) {
    const { error: rmError } = await auth.supabase.storage
      .from("documents")
      .remove([doc.storage_path as string]);
    if (rmError) console.error("[documents] storage remove failed:", rmError.message);
  }

  revalidateDocumentPaths(doc as Parameters<typeof revalidateDocumentPaths>[0]);
  return { ok: true };
}
