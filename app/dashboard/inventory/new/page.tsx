import { NewInventoryForm } from "./new-inventory-form";
import { createClient } from "@/lib/supabase/server";
import type { StoneRow } from "@/lib/db/types";

export default async function NewInventoryPage() {
  const supabase = await createClient();
  const { data: stones } = await supabase
    .from("stones")
    .select("*")
    .eq("is_active", true)
    .order("name");

  return <NewInventoryForm stones={(stones ?? []) as StoneRow[]} />;
}
