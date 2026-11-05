import { notFound } from "next/navigation";

import { DeliveryDocument } from "@/components/deliveries/delivery-document";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { GreenInvoiceInvoiceButton } from "@/components/green-invoice/invoice-button";
import { PaymentsPanel } from "@/components/payments/payments-panel";
import { isGreenInvoiceConfigured } from "@/lib/green-invoice/config";
import { hasIssuedGiId } from "@/lib/green-invoice/status";
import { getCurrentCrmUser } from "@/lib/supabase/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import type {
  DeliveryItemRow,
  DeliveryViewRow,
  InventoryPricingUnitDb,
  OrderChargeRow,
} from "@/lib/db/types";

export default async function DeliveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: delivery, error },
    { data: items },
    { data: linkedDocs },
    me,
  ] = await Promise.all([
    supabase.from("deliveries_view").select("*").eq("id", id).single(),
    supabase
      .from("delivery_items")
      .select("*, inventory_items(pricing_unit)")
      .eq("delivery_id", id),
    supabase
      .from("documents")
      .select("id, green_invoice_id, green_invoice_url")
      .eq("delivery_id", id),
    getCurrentCrmUser(),
  ]);

  if (error || !delivery) notFound();

  const d = delivery as DeliveryViewRow;

  // חיובים נוספים והערות מההזמנה (לא נכללים ב-delivery_items)
  const [{ data: charges }, { data: order }] = await Promise.all([
    supabase
      .from("order_charges")
      .select("*")
      .eq("order_id", d.order_id)
      .order("sort_order"),
    supabase.from("orders").select("notes").eq("id", d.order_id).single(),
  ]);

  const lines = (items ?? []).map((row) => {
    const inv = row.inventory_items as { pricing_unit: InventoryPricingUnitDb } | null;
    const { inventory_items: _inv, ...rest } = row;
    return {
      ...rest,
      inventory_pricing_unit: inv?.pricing_unit ?? "m3",
    } as DeliveryItemRow;
  });

  const docs = linkedDocs ?? [];
  // המסמך שמתאים לחשבונית הנוכחית (green_invoice_id), אחרת כל מסמך עם קישור
  const giDoc =
    (d.green_invoice_id
      ? docs.find((doc) => doc.green_invoice_id === d.green_invoice_id)
      : undefined) ?? docs.find((doc) => doc.green_invoice_url);
  const greenInvoiceUrl = (giDoc?.green_invoice_url as string | null | undefined) ?? null;
  const configured = isGreenInvoiceConfigured();

  return (
    <DeliveryDocument
      delivery={d}
      lines={lines}
      deliveryId={id}
      charges={(charges ?? []) as OrderChargeRow[]}
      orderNotes={(order?.notes as string | null | undefined) ?? null}
      greenInvoiceUrl={greenInvoiceUrl}
      invoiceSlot={
        <GreenInvoiceInvoiceButton
          deliveryId={d.id}
          hasInvoice={hasIssuedGiId(d.green_invoice_id)}
          greenInvoiceUrl={greenInvoiceUrl}
          customerEmail={d.customer_email}
          configured={configured}
          isAdmin={me?.isAdmin}
        />
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <PaymentsPanel deliveryId={d.id} />
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <DocumentsPanel filter={{ deliveryId: d.id }} className="-mt-px" />
        </div>
      </div>
    </DeliveryDocument>
  );
}
