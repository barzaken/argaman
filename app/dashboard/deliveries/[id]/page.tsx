import { notFound } from "next/navigation";

import { DeliveryDocument } from "@/components/deliveries/delivery-document";
import { createClient } from "@/lib/supabase/server";
import type { DeliveryItemRow, DeliveryViewRow } from "@/lib/db/types";

export default async function DeliveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: delivery, error } = await supabase
    .from("deliveries_view")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !delivery) notFound();

  const d = delivery as DeliveryViewRow;

  const { data: items } = await supabase
    .from("delivery_items")
    .select("*")
    .eq("delivery_id", id);

  const lines = (items ?? []) as DeliveryItemRow[];

  return (
    <DeliveryDocument delivery={d} lines={lines} deliveryId={id} />
  );
}
