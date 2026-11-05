import { DocumentForm, type DocumentFormValues } from "@/components/documents/document-form";
import { documentKindLabels } from "@/lib/db/labels";
import type { DocumentKindDb } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

import { asUuid, loadEntityOptions, loadLinkedRefs } from "../form-data";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * העלאת מסמך. פרמטרים למילוי מראש:
 * ?kind=supplier_invoice&customer=<id>&supplier=<id>&order=<id>&delivery=<id>&payment=<id>&expense=<id>&source=whatsapp
 */
export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const kindParam = first(sp.kind);
  const kind = (kindParam in documentKindLabels ? kindParam : "") as DocumentKindDb | "";

  const supabase = await createClient();
  const orderId = asUuid(sp.order);
  const deliveryId = asUuid(sp.delivery);
  let customerId = asUuid(sp.customer);
  const supplierId = asUuid(sp.supplier);

  const [{ customers, suppliers }, linked] = await Promise.all([
    loadEntityOptions(supabase, { customerId, supplierId }),
    loadLinkedRefs(supabase, {
      orderId,
      deliveryId,
      paymentId: asUuid(sp.payment),
      expenseId: asUuid(sp.expense),
    }),
  ]);

  // הזמנה / משלוח שייכים ללקוח — ממלאים אותו כשלא הועבר במפורש
  if (!customerId && (orderId || deliveryId)) {
    const table = deliveryId ? "deliveries" : "orders";
    const { data } = await supabase
      .from(table)
      .select("customer_id")
      .eq("id", (deliveryId ?? orderId)!)
      .maybeSingle();
    customerId = (data?.customer_id as string | undefined) ?? null;
  }

  const customer = customerId ? customers.find((c) => c.id === customerId) : undefined;
  const supplier = supplierId ? suppliers.find((s) => s.id === supplierId) : undefined;
  const counterparty = supplier ?? customer;

  const initial: DocumentFormValues = {
    kind,
    document_number: "",
    document_date: "",
    due_date: "",
    counterparty_name: counterparty?.name ?? "",
    counterparty_tax_id: counterparty?.tax_id ?? "",
    amount_before_vat: "",
    vat_amount: "",
    amount_total: "",
    currency: "ILS",
    notes: "",
    customer_id: customer?.id ?? null,
    supplier_id: supplier?.id ?? null,
    order_id: linked.order?.id ?? null,
    delivery_id: linked.delivery?.id ?? null,
    payment_id: linked.payment?.id ?? null,
    expense_id: linked.expense?.id ?? null,
    source: first(sp.source) === "whatsapp" ? "whatsapp" : "upload",
  };

  return (
    <DocumentForm
      mode="create"
      initial={initial}
      customers={customers}
      suppliers={suppliers}
      linked={linked}
      cancelHref="/dashboard/documents"
    />
  );
}
