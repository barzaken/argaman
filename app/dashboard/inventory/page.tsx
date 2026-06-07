import { KpiCard } from "@/components/kpi-card";
import { createClient } from "@/lib/supabase/server";

import { type InventoryRow } from "./columns";
import { InventoryTable } from "./inventory-table";

export default async function InventoryPage() {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("inventory_items_view")
    .select("*")
    .order("created_at", { ascending: false });

  const list = (rows ?? []) as InventoryRow[];

  const totalItems = list.length;
  const availableItems = list.filter(
    (r) => r.status === "available" && r.quantity_available > 0
  ).length;
  const notAvailableItems = list.filter(
    (r) => r.status === "unavailable" || r.quantity_available <= 0
  ).length;
  const inTransitItems = list.filter((r) => r.status === "in_transit").length;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="grid border-b sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="פריטים במלאי" value={totalItems} icon="package" />
        <KpiCard
          label="זמינים במלאי"
          value={availableItems}
          icon="circle-dollar-sign"
        />
        <KpiCard label="לא במלאי" value={notAvailableItems} icon="calendar" />
        <KpiCard label="במשלוח (בדרך)" value={inTransitItems} icon="truck" />
      </div>
      <div className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
        <div className="mx-auto w-full max-w-[min(100%,80rem)]">
          {error ? (
            <p className="text-destructive text-sm">{error.message}</p>
          ) : (
            <InventoryTable data={list} />
          )}
        </div>
      </div>
    </div>
  );
}
