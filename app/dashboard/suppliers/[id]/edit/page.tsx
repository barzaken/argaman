import { notFound } from "next/navigation";

import { SupplierForm } from "@/components/suppliers/supplier-form";
import { createClient } from "@/lib/supabase/server";
import type { SupplierRow } from "@/lib/db/types";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: supplier, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !supplier) notFound();

  return <SupplierForm supplier={supplier as SupplierRow} />;
}
