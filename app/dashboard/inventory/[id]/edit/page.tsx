import { notFound } from "next/navigation";

import { InventoryEditForm } from "./inventory-edit-form";
import { createClient } from "@/lib/supabase/server";
import type { InventoryItemViewRow } from "@/lib/db/types";
import type { StoneRow } from "@/lib/db/types";

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

  const { data: stones } = await supabase
    .from("stones")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error || !row) notFound();

  return (
    <InventoryEditForm
      row={row as InventoryItemViewRow}
      stones={(stones ?? []) as StoneRow[]}
    />
  );
}
