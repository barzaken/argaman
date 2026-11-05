import { notFound } from "next/navigation";

import { DeliveryDocument } from "@/components/deliveries/delivery-document";
import { createClient } from "@/lib/supabase/server";
import type {
  DeliveryItemRow,
  DeliveryViewRow,
  InventoryPricingUnitDb,
  OrderChargeRow,
  PaymentAllocationViewRow,
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
    { data: allocations },
    { data: linkedDocs },
  ] = await Promise.all([
    supabase.from("deliveries_view").select("*").eq("id", id).single(),
    supabase
      .from("delivery_items")
      .select("*, inventory_items(pricing_unit)")
      .eq("delivery_id", id),
    supabase
      .from("payment_allocations_view")
      .select("*")
      .eq("delivery_id", id)
      .order("paid_at", { ascending: false }),
    supabase
      .from("documents")
      .select("id, green_invoice_id, green_invoice_url")
      .eq("delivery_id", id),
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

  const greenInvoiceUrl =
    (linkedDocs ?? []).find((doc) => doc.green_invoice_url)?.green_invoice_url ??
    null;

  return (
    <DeliveryDocument
      delivery={d}
      lines={lines}
      deliveryId={id}
      charges={(charges ?? []) as OrderChargeRow[]}
      orderNotes={(order?.notes as string | null | undefined) ?? null}
      allocations={(allocations ?? []) as PaymentAllocationViewRow[]}
      greenInvoiceUrl={greenInvoiceUrl as string | null}
    />
  );
}
