import { notFound } from "next/navigation";

import { EditCustomerForm } from "./edit-customer-form";
import { createClient } from "@/lib/supabase/server";
import type { CustomerRow } from "@/lib/db/types";

export default async function EditCustomerRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !customer) notFound();

  return <EditCustomerForm customer={customer as CustomerRow} />;
}
