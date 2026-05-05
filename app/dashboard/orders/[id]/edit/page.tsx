import { notFound } from "next/navigation";

import { OrderHeaderEditForm } from "./order-header-edit-form";
import { createClient } from "@/lib/supabase/server";
import type { OrderRow } from "@/lib/db/types";

export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !order) notFound();

  return <OrderHeaderEditForm order={order as OrderRow} />;
}
