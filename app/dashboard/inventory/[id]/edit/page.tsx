import { notFound } from "next/navigation";

import { InventoryEditForm } from "./inventory-edit-form";
import { createClient } from "@/lib/supabase/server";
import type {
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

  const [{ data: stones }, { data: orderItemRows }] = await Promise.all([
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
  ]);

  return (
    <InventoryEditForm
      row={row as InventoryItemViewRow}
      stones={(stones ?? []) as StoneRow[]}
      orderItemRows={(orderItemRows ?? []) as OrderItemViewRow[]}
    />
  );
}
