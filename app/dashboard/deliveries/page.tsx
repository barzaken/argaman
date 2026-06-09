import { CrmDataTable } from "@/components/crm/data-table";
import { KpiCard } from "@/components/kpi-card";
import { createClient } from "@/lib/supabase/server";

import { deliveriesColumnLabels, deliveriesColumns } from "./columns";
import type { DeliveryViewRow } from "@/lib/db/types";

export default async function DeliveriesPage() {
  const supabase = await createClient();

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [{ data: rows, error }, { count: weekCount }, { count: inTransit }, { count: deliveredMonth }, { count: waitingPickup }] =
    await Promise.all([
      supabase
        .from("deliveries_view")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(400),
      supabase
        .from("deliveries")
        .select("*", { count: "exact", head: true })
        .gte("created_at", weekStart.toISOString()),
      supabase
        .from("deliveries")
        .select("*", { count: "exact", head: true })
        .eq("status", "in_transit"),
      supabase
        .from("deliveries")
        .select("*", { count: "exact", head: true })
        .eq("status", "delivered")
        .gte("delivered_at", monthStart.toISOString().slice(0, 10)),
      supabase
        .from("deliveries")
        .select("*", { count: "exact", head: true })
        .eq("status", "waiting_for_pickup"),
    ]);

  const list = (rows ?? []) as DeliveryViewRow[];

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="grid border-b grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="משלוחים השבוע"
          value={weekCount ?? 0}
          icon="calendar-range"
        />
        <KpiCard label="בדרך כעת" value={inTransit ?? 0} icon="truck" />
        <KpiCard
          label="נמסרו החודש"
          value={deliveredMonth ?? 0}
          icon="package-open"
        />
        <KpiCard
          label="ממתינים לאיסוף"
          value={waitingPickup ?? 0}
          icon="warehouse"
        />
      </div>
      <div className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
        <div className="mx-auto w-full max-w-[min(100%,80rem)]">
          {error ? (
            <p className="text-destructive text-sm">{error.message}</p>
          ) : (
            <CrmDataTable
              columns={deliveriesColumns}
              data={list}
              filterColumnId="customer_name"
              filterPlaceholder="סנן לפי לקוח..."
              columnLabels={deliveriesColumnLabels}
              navigateRows="delivery-detail"
            />
          )}
        </div>
      </div>
    </div>
  );
}
