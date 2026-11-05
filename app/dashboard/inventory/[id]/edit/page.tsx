import { notFound } from "next/navigation";

import { InventoryEditForm } from "./inventory-edit-form";
import { createClient } from "@/lib/supabase/server";
import type { SupplierOption } from "@/components/suppliers/supplier-picker";
import type {
  DocumentViewRow,
  InventoryItemViewRow,
  OrderItemViewRow,
  StoneRow,
} from "@/lib/db/types";

export default async function EditInventoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("inventory_items_view")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !row) notFound();

  const sourceDocumentId = (row as InventoryItemViewRow).source_document_id;
  const [{ data: stones }, { data: orderItemRows }, { data: suppliers }, docRes] = await Promise.all([
    supabase
      .from("stones")
      .select("*")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("order_items_view")
      .select("*")
      .eq("inventory_item_id", id)
      .order("order_number", { ascending: false }),
    supabase.from("suppliers").select("id, name, tax_id, is_active").order("name"),
    sourceDocumentId
      ? supabase.from("documents_view").select("*").eq("id", sourceDocumentId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <InventoryEditForm
      row={row as InventoryItemViewRow}
      stones={(stones ?? []) as StoneRow[]}
      orderItemRows={(orderItemRows ?? []) as OrderItemViewRow[]}
      suppliers={(suppliers ?? []) as SupplierOption[]}
      sourceDocument={(docRes.data ?? null) as DocumentViewRow | null}
    />
  );
}
