import { OrderForm } from "./order-form";
import { createClient } from "@/lib/supabase/server";
import type { CustomerStonePriceRow } from "@/lib/db/types";
import type { CustomerRow } from "@/lib/db/types";
import type { InventoryItemViewRow } from "@/lib/db/types";
import type { StoneRow } from "@/lib/db/types";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ inventory?: string }>;
}) {
  const { inventory: inventoryParam } = await searchParams;
  const initialInventoryIds =
    inventoryParam
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const supabase = await createClient();

  const [{ data: customers }, { data: stones }, { data: inventory }, { data: overrides }] =
    await Promise.all([
      supabase.from("customers").select("*").eq("is_active", true).order("name"),
      supabase.from("stones").select("*").eq("is_active", true).order("name"),
      supabase
        .from("inventory_items_view")
        .select("*")
        .eq("status", "available")
        .gt("quantity_available", 0)
        .order("created_at", { ascending: false }),
      supabase.from("customer_stone_prices").select("*"),
    ]);

  return (
    <OrderForm
      customers={(customers ?? []) as CustomerRow[]}
      stones={(stones ?? []) as StoneRow[]}
      inventory={(inventory ?? []) as InventoryItemViewRow[]}
      overrides={(overrides ?? []) as CustomerStonePriceRow[]}
      initialInventoryIds={initialInventoryIds}
    />
  );
}
