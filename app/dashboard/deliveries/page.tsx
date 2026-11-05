import { CrmDataTable } from "@/components/crm/data-table";
import { KpiCard } from "@/components/kpi-card";
import { createClient } from "@/lib/supabase/server";
import { toHebrewError } from "@/lib/db/errors";
import { todayIsoInIsrael } from "@/lib/db/format";

import { deliveriesColumnLabels, deliveriesColumns } from "./columns";
import type { DeliveryViewRow } from "@/lib/db/types";

export default async function DeliveriesPage() {
  const supabase = await createClient();

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);

  // YYYY-MM-01 לפי שעון ישראל (delivered_at הוא date)
  const monthStartDate = `${todayIsoInIsrael().slice(0, 8)}01`;

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
        .gte("delivered_at", monthStartDate),
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
            <p className="text-destructive text-sm">{toHebrewError(error, "טעינת הנתונים נכשלה. נסו לרענן את הדף.")}</p>
          ) : (
            <CrmDataTable
              columns={deliveriesColumns}
              data={list}
              filterColumnId="customer_name"
              filterPlaceholder="סנן לפי לקוח..."
              columnLabels={deliveriesColumnLabels}
              navigateRows="delivery-detail"
              truncatedAt={400}
            />
          )}
        </div>
      </div>
    </div>
  );
}
