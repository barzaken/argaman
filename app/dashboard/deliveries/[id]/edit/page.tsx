import { notFound } from "next/navigation";

import { DeliveryEditForm } from "./delivery-edit-form";
import { createClient } from "@/lib/supabase/server";
import type { DeliveryViewRow } from "@/lib/db/types";

export default async function EditDeliveryPage({
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

  return <DeliveryEditForm delivery={delivery as DeliveryViewRow} />;
}
