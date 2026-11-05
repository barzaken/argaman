import { NewPaymentForm, type LinkedDocumentInfo } from "./new-payment-form";
import { createClient } from "@/lib/supabase/server";
import { toHebrewError } from "@/lib/db/errors";
import type { OpenDelivery } from "@/components/payments/allocation-utils";
import type { PickerCustomer } from "@/components/payments/customer-picker";
import type { PaymentMethodDb } from "@/lib/db/types";
import { paymentMethodLabels } from "@/lib/db/labels";
import { todayIsoInIsrael } from "@/lib/db/format";

type SearchParams = {
  customer?: string;
  delivery?: string;
  document?: string;
  amount?: string;
  method?: string;
  reference?: string;
  paid_at?: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/**
 * רישום תשלום מלקוח.
 * פרמטרים אופציונליים: ?customer=<id> ?delivery=<id> (שיוך יתרת התעודה)
 * ?document=<id> (קישור מסמך: צילום צ׳ק / אישור העברה) ?amount= ?method= ?reference= ?paid_at=
 */
export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const documentId = sp.document && UUID_RE.test(sp.document) ? sp.document : null;

  const [customersRes, openRes, creditRes, docRes] = await Promise.all([
    supabase.from("customers").select("id, name, tax_id").order("name"),
    supabase
      .from("debtors_view")
      .select(
        "delivery_id, delivery_number, order_number, customer_id, payment_due_date, total, amount_paid, balance"
      )
      .gt("balance", 0)
      .order("delivery_number", { ascending: true }),
    supabase
      .from("payments_view")
      .select("customer_id, unallocated_amount")
      .gt("unallocated_amount", 0),
    documentId
      ? supabase
          .from("documents_view")
          .select(
            "id, kind, status, document_number, document_date, amount_total, customer_id, counterparty_name, counterparty_tax_id, payment_id, payment_number"
          )
          .eq("id", documentId)
          .limit(1)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const loadError = customersRes.error ?? openRes.error;
  if (loadError) {
    return (
      <div className="p-6">
        <p className="text-destructive text-sm">
          {toHebrewError(loadError, "טעינת הנתונים נכשלה. נסו לרענן את הדף.")}
        </p>
      </div>
    );
  }

  const customers = (customersRes.data ?? []) as PickerCustomer[];
  const openDeliveries = (openRes.data ?? []) as OpenDelivery[];

  const creditByCustomer: Record<string, number> = {};
  for (const r of creditRes.data ?? []) {
    const cid = r.customer_id as string;
    creditByCustomer[cid] =
      Math.round(((creditByCustomer[cid] ?? 0) + Number(r.unallocated_amount)) * 100) / 100;
  }

  const doc = (docRes.data?.[0] ?? null) as LinkedDocumentInfo | null;

  // לקוח: ?customer → הלקוח של המסמך → התאמת ח.פ של המסמך
  let customerId =
    sp.customer && customers.some((c) => c.id === sp.customer)
      ? sp.customer
      : "";
  if (!customerId && doc?.customer_id) customerId = doc.customer_id;
  if (!customerId && doc?.counterparty_tax_id) {
    const t = digits(doc.counterparty_tax_id);
    const match = customers.filter((c) => digits(c.tax_id) === t);
    if (t && match.length === 1) customerId = match[0].id;
  }

  const delivery =
    sp.delivery != null
      ? openDeliveries.find((d) => d.delivery_id === sp.delivery)
      : undefined;
  if (!customerId && delivery) customerId = delivery.customer_id;

  let amount = "";
  if (sp.amount && /^\d+([.,]\d+)?$/.test(sp.amount.trim())) {
    amount = sp.amount.trim().replace(",", ".");
  } else if (doc?.amount_total != null && Number(doc.amount_total) > 0) {
    amount = String(Number(doc.amount_total));
  } else if (delivery) {
    amount = Number(delivery.balance).toFixed(2);
  }

  const initialAllocations: Record<string, string> = {};
  if (delivery && delivery.customer_id === customerId) {
    const cap = amount ? Number(amount) : Number(delivery.balance);
    const v = Math.min(Number(delivery.balance), cap);
    if (v > 0) initialAllocations[delivery.delivery_id] = v.toFixed(2);
  }

  const method =
    sp.method && sp.method in paymentMethodLabels
      ? (sp.method as PaymentMethodDb)
      : "";

  const paidAt =
    sp.paid_at && /^\d{4}-\d{2}-\d{2}$/.test(sp.paid_at)
      ? sp.paid_at
      : (doc?.document_date ?? todayIsoInIsrael());

  return (
    <NewPaymentForm
      customers={customers}
      openDeliveries={openDeliveries}
      creditByCustomer={creditByCustomer}
      linkedDocument={doc}
      documentNotFound={Boolean(sp.document) && !doc}
      initial={{
        customerId,
        amount,
        method,
        reference: sp.reference?.slice(0, 200) ?? "",
        paidAt,
        allocations: initialAllocations,
      }}
    />
  );
}
