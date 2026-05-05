import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/kpi-card";
import { createClient } from "@/lib/supabase/server";
import type {
  DashboardKpisRow,
  InventoryItemViewRow,
  OrderItemStatusDb,
  OrderItemViewRow,
  PriorityDb,
} from "@/lib/db/types";

const orderItemStatusLabels: Record<OrderItemStatusDb, string> = {
  pending: "ממתין",
  in_progress: "בייצור",
  completed: "הושלם",
  cancelled: "בוטל",
};

const priorityLabels: Record<PriorityDb, string> = {
  low: "נמוך",
  medium: "בינוני",
  urgent: "דחוף",
};

function priorityDotClass(priority: PriorityDb): string {
  switch (priority) {
    case "urgent":
      return "bg-destructive";
    case "medium":
      return "bg-amber-500 dark:bg-amber-400";
    case "low":
      return "bg-muted-foreground";
  }
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: kpiRow } = await supabase
    .from("dashboard_kpis_view")
    .select("*")
    .single();

  const kpi = kpiRow as DashboardKpisRow | null;

  const { data: catalogInventory } = await supabase
    .from("inventory_items_view")
    .select("*")
    .gt("quantity_available", 0)
    .in("status", ["available", "in_transit"])
    .order("created_at", { ascending: false })
    .limit(24);

  const { data: todoItems } = await supabase
    .from("order_items_view")
    .select("*")
    .neq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(40);

  const openOrdersCount = Number(kpi?.open_orders_count ?? 0);
  const unpaidDeliveriesCount = Number(kpi?.unpaid_deliveries_count ?? 0);
  const receivablesTotal = Math.round(Number(kpi?.receivables_total ?? 0));
  const receivablesWeek = Math.round(Number(kpi?.receivables_due_week ?? 0));

  const catalog = (catalogInventory ?? []) as InventoryItemViewRow[];
  const todos = (todoItems ?? []) as OrderItemViewRow[];

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="grid border-b sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="הזמנות פתוחות"
          value={openOrdersCount}
          icon="layout-dashboard"
        />
        <KpiCard
          label="תעודות שלא שולמו"
          value={unpaidDeliveriesCount}
          icon="file-warning"
        />
        <KpiCard
          label="יתרה לגבייה"
          value={receivablesTotal}
          icon="circle-dollar-sign"
        />
        <KpiCard
          label="לגבייה השבוע"
          value={receivablesWeek}
          icon="circle-dollar-sign"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-[3] flex-col overflow-auto border-border lg:border-l">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">קטלוג במלאי</h2>
            <p className="text-muted-foreground text-xs">משלוחים עם זמינות</p>
          </div>
          <ul className="grid list-none gap-3 p-4 sm:grid-cols-3">
            {catalog.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/dashboard/inventory/${row.id}/edit`}
                  className="block overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors hover:bg-muted/30 hover:border-muted-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div
                    className="h-36  w-full border-b border-black/10"
                    style={{ backgroundColor: row.color_hex }}
                    aria-hidden
                  />
                  <div className="flex flex-col gap-1 p-3">
                    <p className="text-sm font-semibold">{row.stone_name}</p>
                    <p className="text-muted-foreground text-xs">{row.polish_type}</p>
                    <p className="text-muted-foreground text-xs">
                      זמין {row.quantity_available} · נפח משלוח {row.volume_m3}{" "}
                      קו״ב
                    </p>
                  </div>
                </Link>
              </li>
            ))}
            {catalog.length === 0 ? (
              <li className="text-muted-foreground col-span-full text-center text-sm py-8">
                אין זמינות במלאי להצגה
              </li>
            ) : null}
          </ul>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              פריטי הזמנה לביצוע
            </h2>
            <p className="text-muted-foreground text-xs">
              פריטים שטרם סומנו כהושלמו
            </p>
          </div>
          <ul className="flex flex-col gap-2 p-4">
            {todos.map((it) => (
              <li key={it.id}>
                <Link
                  href={`/dashboard/orders/${it.order_id}`}
                  className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-start transition-colors hover:bg-muted/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-card-foreground">
                      {it.customer_name}
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      #{it.order_number}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">{it.stone_name}</p>
                  <p className="text-muted-foreground text-xs">
                    סטטוס : {orderItemStatusLabels[it.status]} · תעדוף הזמנה:{ " "}
                    <span className="inline-flex items-center gap-1.5 align-middle">
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${priorityDotClass(it.order_priority)}`}
                        aria-hidden
                      />
                      <span>{priorityLabels[it.order_priority]}</span>
                    </span>
                  </p>
                </Link>
              </li>
            ))}
            {todos.length === 0 ? (
              <li className="text-muted-foreground text-center text-sm py-8">
                אין פריטים פתוחים
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
