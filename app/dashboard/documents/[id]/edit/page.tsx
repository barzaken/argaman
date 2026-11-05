import { notFound } from "next/navigation";

import { DocumentForm, type DocumentFormValues } from "@/components/documents/document-form";
import type { DocumentRow } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

import { loadEntityOptions, loadLinkedRefs } from "../../form-data";

const str = (v: string | number | null | undefined) => (v == null ? "" : String(v));

export default async function EditDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.from("documents").select("*").eq("id", id).single();
  if (error || !data) notFound();
  const d = data as DocumentRow;

  const [{ customers, suppliers }, linked] = await Promise.all([
    loadEntityOptions(supabase, { customerId: d.customer_id, supplierId: d.supplier_id }),
    loadLinkedRefs(supabase, {
      orderId: d.order_id,
      deliveryId: d.delivery_id,
      paymentId: d.payment_id,
      expenseId: d.expense_id,
    }),
  ]);

  const initial: DocumentFormValues = {
    kind: d.kind,
    document_number: str(d.document_number),
    document_date: str(d.document_date),
    due_date: str(d.due_date),
    counterparty_name: str(d.counterparty_name),
    counterparty_tax_id: str(d.counterparty_tax_id),
    amount_before_vat: str(d.amount_before_vat),
    vat_amount: str(d.vat_amount),
    amount_total: str(d.amount_total),
    currency: d.currency || "ILS",
    notes: str(d.notes),
    customer_id: d.customer_id,
    supplier_id: d.supplier_id,
    order_id: d.order_id,
    delivery_id: d.delivery_id,
    payment_id: d.payment_id,
    expense_id: d.expense_id,
    // מקורות מערכת (green_invoice / system) לא נבחרים בטופס — נשמרים כ"הועלה"
    source: d.source === "whatsapp" ? "whatsapp" : "upload",
  };

  return (
    <DocumentForm
      mode="edit"
      documentId={d.id}
      initial={initial}
      customers={customers}
      suppliers={suppliers}
      linked={linked}
      existingFile={{ file_name: d.file_name, mime_type: d.mime_type, file_size: d.file_size }}
      currentStatus={d.status}
      cancelHref={`/dashboard/documents/${d.id}`}
    />
  );
}
