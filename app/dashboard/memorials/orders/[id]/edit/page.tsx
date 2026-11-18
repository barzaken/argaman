import { notFound } from "next/navigation";

import { OrderForm } from "@/components/memorials/order-form";
import { createClient } from "@/lib/supabase/server";
import type { MemOrderRow } from "@/lib/memorials/constants";

export default async function EditMemorialOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("mem_orders").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return <OrderForm order={data as MemOrderRow} />;
}
