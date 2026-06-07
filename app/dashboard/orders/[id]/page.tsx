import { notFound } from "next/navigation";

import { OrderDocument } from "@/components/orders/order-document";
import { createClient } from "@/lib/supabase/server";
import type { OrderItemViewRow, OrderViewRow } from "@/lib/db/types";

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

  const [{ data: items }, { data: customer }] = await Promise.all([
    supabase.from("order_items_view").select("*").eq("order_id", id),
    supabase
      .from("customers")
      .select("tax_id, address, phone")
      .eq("id", o.customer_id)
      .single(),
  ]);

  if (!customer) notFound();

  const lines = (items ?? []) as OrderItemViewRow[];

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
    />
  );
}
