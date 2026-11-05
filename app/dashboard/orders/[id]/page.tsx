import { notFound } from "next/navigation";

import { OrderDocument } from "@/components/orders/order-document";
import { createClient } from "@/lib/supabase/server";
import type {
  OrderChargeRow,
  OrderItemViewRow,
  OrderViewRow,
} from "@/lib/db/types";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from("orders_view")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !order) notFound();

  const o = order as OrderViewRow;

  const [{ data: items }, { data: customer }, { data: charges }, { data: deliveries }] =
    await Promise.all([
      supabase.from("order_items_view").select("*").eq("order_id", id),
      supabase
        .from("customers")
        .select("tax_id, address, phone")
        .eq("id", o.customer_id)
        .single(),
      supabase
        .from("order_charges")
        .select("*")
        .eq("order_id", id)
        .order("sort_order"),
      supabase
        .from("deliveries")
        .select("id, delivery_number")
        .eq("order_id", id)
        .limit(1),
    ]);

  if (!customer) notFound();

  const rawLines = (items ?? []) as OrderItemViewRow[];
  const inventoryIds = [
    ...new Set(rawLines.map((ln) => ln.inventory_item_id)),
  ];

  const { data: inventoryPricing } =
    inventoryIds.length > 0
      ? await supabase
          .from("inventory_items")
          .select("id, pricing_unit, price_per_m2")
          .in("id", inventoryIds)
      : { data: [] };

  const pricingByInventoryId = new Map(
    (inventoryPricing ?? []).map((row) => [row.id, row])
  );

  const lines = rawLines.map((ln) => {
    const inv = pricingByInventoryId.get(ln.inventory_item_id);
    return {
      ...ln,
      inventory_pricing_unit:
        ln.inventory_pricing_unit ?? inv?.pricing_unit ?? "m3",
      inventory_price_per_m2:
        ln.inventory_price_per_m2 ?? inv?.price_per_m2 ?? null,
    };
  });

  return (
    <OrderDocument
      order={o}
      customer={{
        tax_id: customer.tax_id,
        address: customer.address,
        phone: customer.phone,
      }}
      lines={lines}
      orderId={id}
      charges={(charges ?? []) as OrderChargeRow[]}
      delivery={
        ((deliveries ?? [])[0] as { id: string; delivery_number: number } | undefined) ??
        null
      }
    />
  );
}
