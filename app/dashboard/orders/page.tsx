import { CrmDataTable } from "@/components/crm/data-table";
import { KpiCard } from "@/components/kpi-card";
import { createClient } from "@/lib/supabase/server";

import { ordersColumnLabels, ordersColumns } from "./columns";
import type { OrderViewRow } from "@/lib/db/types";

export default async function OrdersPage() {
  const supabase = await createClient();

  const { data: orders, error } = await supabase
    .from("orders_view")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(400);

  const list = (orders ?? []) as OrderViewRow[];

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: openOrders } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .in("status", ["open", "in_production", "ready_for_delivery"]);

  const { count: inProduction } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("status", "in_production");

  const { count: readyShip } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("status", "ready_for_delivery");

  const { count: monthCount } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startOfMonth.toISOString());

  const openOrdersCount = openOrders ?? 0;
  const inProductionCount = inProduction ?? 0;
  const readyShipCount = readyShip ?? 0;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="grid border-b sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="הזמנות פתוחות"
          value={openOrdersCount}
          icon="layout-dashboard"
        />
        <KpiCard
          label="בייצור עכשיו"
          value={inProductionCount}
          icon="factory"
        />
        <KpiCard
          label="מוכן למשלוח"
          value={readyShipCount}
          icon="clipboard-check"
        />
        <KpiCard
          label="סך הזמנות החודש"
          value={monthCount ?? 0}
          icon="calendar"
        />
      </div>
      <div className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
        <div className="mx-auto w-full max-w-[min(100%,80rem)]">
          {error ? (
            <p className="text-destructive text-sm">{error.message}</p>
          ) : (
            <CrmDataTable
              columns={ordersColumns}
              data={list}
              filterColumnId="customer_name"
              filterPlaceholder="סנן לפי לקוח..."
              columnLabels={ordersColumnLabels}
              navigateRows="order-detail"
            />
          )}
        </div>
      </div>
    </div>
  );
}
