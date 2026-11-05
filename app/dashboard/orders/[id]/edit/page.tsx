import { notFound } from "next/navigation";

import { OrderHeaderEditForm } from "./order-header-edit-form";
import { createClient } from "@/lib/supabase/server";
import type { OrderChargeRow, OrderRow } from "@/lib/db/types";

export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: order, error }, { data: charges }, { data: deliveries }] =
    await Promise.all([
      supabase.from("orders").select("*").eq("id", id).single(),
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

  if (error || !order) notFound();

  const delivery = (deliveries ?? [])[0] as
    | { id: string; delivery_number: number }
    | undefined;

  return (
    <OrderHeaderEditForm
      order={order as OrderRow}
      charges={(charges ?? []) as OrderChargeRow[]}
      deliveryNumber={delivery?.delivery_number ?? null}
    />
  );
}
