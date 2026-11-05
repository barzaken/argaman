"use server";

import { revalidatePath } from "next/cache";

import { z } from "@/lib/zod-he";
import { toHebrewError } from "@/lib/db/errors";
import { documentKindLabels } from "@/lib/db/labels";
import type { DocumentKindDb, DocumentStatusDb, DocumentViewRow } from "@/lib/db/types";
import type { DocumentLinkTypeDb, DocumentLinkViewRow } from "@/lib/db/types-document-links";
import { giDocTypeName } from "@/lib/green-invoice/document-types";
import { requireAdmin, requireAuth } from "@/lib/supabase/auth-helpers";

/**
 * קישורים בין מסמכים (document_links). הוספה — כל משתמש מורשה; הסרה — מנהל בלבד.
 */

export type LinksResult<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string };

/** מסמך לבחירה בחיפוש ("קישור למסמך") */
export type LinkableDocument = {
  id: string;
  kind: DocumentKindDb;
  /** "חשבונית מס 40001" / "הזמנה 5" */
  label: string;
  document_number: string | null;
  document_date: string | null;
  counterparty_name: string | null;
  amount_total: number | null;
  currency: string;
  status: DocumentStatusDb;
  green_invoice_id: string | null;
  green_invoice_type: number | null;
  green_invoice_url: string | null;
  customer_id: string | null;
  supplier_id: string | null;
};

const uuid = z.string().uuid("מזהה לא תקין");
const LINK_TYPES = ["link", "cancel", "copy", "related"] as const satisfies readonly DocumentLinkTypeDb[];

function labelFor(d: { kind: DocumentKindDb; document_number: string | null; green_invoice_type: number | null }): string {
  const kind = d.green_invoice_type ? giDocTypeName(d.green_invoice_type) : (documentKindLabels[d.kind] ?? "מסמך");
  return d.document_number ? `${kind} ${d.document_number}` : kind;
}

function toLinkable(r: DocumentViewRow): LinkableDocument {
  return {
    id: r.id,
    kind: r.kind,
    label: labelFor(r),
    document_number: r.document_number,
    document_date: r.document_date,
    counterparty_name: r.counterparty_name ?? r.customer_name ?? r.supplier_name ?? null,
    amount_total: r.amount_total == null ? null : Number(r.amount_total),
    currency: r.currency,
    status: r.status,
    green_invoice_id: r.green_invoice_id,
    green_invoice_type: r.green_invoice_type,
    green_invoice_url: r.green_invoice_url,
    customer_id: r.customer_id,
    supplier_id: r.supplier_id,
  };
}

/** קישורים של מסמך בשני הכיוונים */
export async function listDocumentLinks(
  documentId: string
): Promise<LinksResult<{ outgoing: DocumentLinkViewRow[]; incoming: DocumentLinkViewRow[] }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!uuid.safeParse(documentId).success) return { ok: false, message: "מזהה לא תקין" };
  const [out, inc] = await Promise.all([
    auth.supabase.from("document_links_view").select("*").eq("from_document_id", documentId).order("created_at"),
    auth.supabase.from("document_links_view").select("*").eq("to_document_id", documentId).order("created_at"),
  ]);
  if (out.error) return { ok: false, message: toHebrewError(out.error) };
  if (inc.error) return { ok: false, message: toHebrewError(inc.error) };
  return {
    ok: true,
    outgoing: (out.data ?? []) as DocumentLinkViewRow[],
    incoming: (inc.data ?? []) as DocumentLinkViewRow[],
  };
}

const searchSchema = z.object({
  query: z.string().trim().max(100).default(""),
  kind: z.string().max(40).optional(),
  excludeId: z.string().uuid().optional(),
  /** רק מסמכים שהופקו ב-Morning (יש green_invoice_id) */
  greenInvoiceOnly: z.boolean().optional(),
  customerId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(25),
});

export type DocumentSearchInput = z.input<typeof searchSchema>;

/**
 * חיפוש מסמכים לקישור: מספר מסמך (ספרות) או שם הצד השני, + סינון לפי סוג.
 * (ה-API של Supabase המקומי לא תומך ב-or= — לכן שדה חיפוש אחד לפי צורת הטקסט.)
 */
export async function searchDocumentsForLink(raw: DocumentSearchInput): Promise<LinksResult<{ items: LinkableDocument[] }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };
  const parsed = searchSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" };
  const { query, kind, excludeId, greenInvoiceOnly, customerId, limit } = parsed.data;
  let q = auth.supabase
    .from("documents_view")
    .select("*")
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(limit * 3);
  if (query) {
    const safe = query.replace(/[%*,()]/g, " ").trim();
    if (/^[\d\s-]+$/.test(safe)) q = q.ilike("document_number", `%${safe.replace(/\s/g, "")}%`);
    else if (safe) q = q.ilike("counterparty_name", `%${safe}%`);
  }
  if (kind && kind in documentKindLabels) q = q.eq("kind", kind);
  if (customerId) q = q.eq("customer_id", customerId);
  if (greenInvoiceOnly) q = q.not("green_invoice_id", "is", null);
  const { data, error } = await q;
  if (error) return { ok: false, message: toHebrewError(error) };
  const items = ((data ?? []) as DocumentViewRow[])
    .filter((r) => r.id !== excludeId)
    // נעילות זמניות (pending:/cancelling:) אינן מסמכים
    .filter((r) => !greenInvoiceOnly || (r.green_invoice_id && !/^(pending|cancelling):/.test(r.green_invoice_id)))
    .slice(0, limit)
    .map(toLinkable);
  return { ok: true, items };
}

const addSchema = z.object({
  fromDocumentId: uuid,
  toDocumentId: uuid,
  linkType: z.enum(LINK_TYPES).default("related"),
  note: z.string().trim().max(300).optional().nullable(),
});

export type AddDocumentLinkInput = z.input<typeof addSchema>;

export async function addDocumentLink(raw: AddDocumentLinkInput): Promise<LinksResult<{ id: string }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };
  const parsed = addSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" };
  const { fromDocumentId, toDocumentId, linkType, note } = parsed.data;
  if (fromDocumentId === toDocumentId) return { ok: false, message: "לא ניתן לקשר מסמך לעצמו" };
  // קישור הפוך קיים? (המסמכים כבר מקושרים)
  const { data: reverse, error: rErr } = await auth.supabase
    .from("document_links")
    .select("id")
    .eq("from_document_id", toDocumentId)
    .eq("to_document_id", fromDocumentId)
    .limit(1);
  if (rErr) return { ok: false, message: toHebrewError(rErr) };
  if ((reverse ?? []).length) return { ok: false, message: "המסמכים כבר מקושרים" };
  const { data, error } = await auth.supabase
    .from("document_links")
    .insert({ from_document_id: fromDocumentId, to_document_id: toDocumentId, link_type: linkType, note: note || null })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, message: "המסמכים כבר מקושרים" };
    return { ok: false, message: toHebrewError(error) };
  }
  revalidatePath(`/dashboard/documents/${fromDocumentId}`);
  revalidatePath(`/dashboard/documents/${toDocumentId}`);
  return { ok: true, id: (data as { id: string }).id };
}

export async function removeDocumentLink(linkId: string): Promise<LinksResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!uuid.safeParse(linkId).success) return { ok: false, message: "מזהה לא תקין" };
  const { data, error } = await auth.supabase
    .from("document_links")
    .delete()
    .eq("id", linkId)
    .select("from_document_id, to_document_id");
  if (error) return { ok: false, message: toHebrewError(error) };
  const row = (data ?? [])[0] as { from_document_id: string; to_document_id: string } | undefined;
  if (!row) return { ok: false, message: "הקישור לא נמצא (ייתכן שכבר הוסר)" };
  revalidatePath(`/dashboard/documents/${row.from_document_id}`);
  revalidatePath(`/dashboard/documents/${row.to_document_id}`);
  return { ok: true };
}
