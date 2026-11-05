/**
 * טיפוסים לקישורים בין מסמכים ולנעילת הפקה ב-Morning
 * (sql/patch-2026-11-document-links.sql).
 */
import type { DocumentKindDb, DocumentStatusDb } from "@/lib/db/types";

export type DocumentLinkTypeDb = "link" | "cancel" | "copy" | "related";

export const documentLinkTypeLabels: Record<DocumentLinkTypeDb, string> = {
  link: "מקושר",
  cancel: "מבטל",
  copy: "העתק",
  related: "קשור",
};

/** מנקודת המבט של המסמך השני (to): "בוטל ע״י", "קושר מ-" */
export const documentLinkTypeReverseLabels: Record<DocumentLinkTypeDb, string> = {
  link: "מקושר אליו",
  cancel: "בוטל ע״י",
  copy: "הועתק אל",
  related: "קשור",
};

export const documentLinkTypeOptions: { value: DocumentLinkTypeDb; label: string }[] = (
  Object.keys(documentLinkTypeLabels) as DocumentLinkTypeDb[]
).map((value) => ({ value, label: documentLinkTypeLabels[value] }));

export type DocumentLinkRow = {
  id: string;
  /** המסמך החדש (קבלה / זיכוי / חשבונית) */
  from_document_id: string;
  /** המסמך שהוא מתייחס אליו */
  to_document_id: string;
  link_type: DocumentLinkTypeDb;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type DocumentLinkViewRow = DocumentLinkRow & {
  from_kind: DocumentKindDb;
  from_document_number: string | null;
  from_document_date: string | null;
  from_amount_total: number | null;
  from_currency: string;
  from_counterparty_name: string | null;
  from_green_invoice_type: number | null;
  from_green_invoice_url: string | null;
  from_status: DocumentStatusDb;
  to_kind: DocumentKindDb;
  to_document_number: string | null;
  to_document_date: string | null;
  to_amount_total: number | null;
  to_currency: string;
  to_counterparty_name: string | null;
  to_green_invoice_type: number | null;
  to_green_invoice_url: string | null;
  to_status: DocumentStatusDb;
};

export type GiIssueRequestStatusDb = "pending" | "issued" | "failed";

export type GiIssueRequestRow = {
  id: string;
  doc_type: number;
  status: GiIssueRequestStatusDb;
  green_invoice_id: string | null;
  document_id: string | null;
  description: string | null;
  client_name: string | null;
  amount: number | null;
  error: string | null;
  lock_token: string | null;
  created_by: string | null;
  locked_at: string;
  created_at: string;
  updated_at: string;
};
