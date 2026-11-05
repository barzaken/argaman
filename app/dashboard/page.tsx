import Link from "next/link";

import { DashboardOrderTodos } from "@/components/dashboard-order-todos";
import { KpiCard } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import type {
  DashboardKpisRow,
  OrderItemViewRow,
  StoneRow,
} from "@/lib/db/types";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: kpiRow }, { data: catalogStones }, { data: invRows }, { data: todoItems }] =
    await Promise.all([
      supabase.from("dashboard_kpis_view").select("*").single(),
      supabase.from("stones").select("*").eq("is_active", true).order("name"),
      supabase
        .from("inventory_items_view")
        .select("stone_id")
        .gt("quantity_available", 0),
      supabase
        .from("order_items_view")
        .select("*")
        .not("status", "in", "(completed,cancelled)")
        .neq("order_status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

  const kpi = kpiRow as DashboardKpisRow | null;

  const availStoneIds = new Set(
    (invRows ?? []).map((r) => r.stone_id as string)
  );

  const openOrdersCount = Number(kpi?.open_orders_count ?? 0);
  const unpaidDeliveriesCount = Number(kpi?.unpaid_deliveries_count ?? 0);
  const receivablesTotal = Math.round(Number(kpi?.receivables_total ?? 0));
  const monthlyRevenue = Math.round(Number(kpi?.monthly_revenue ?? 0));
  const monthlyPayments = Math.round(Number(kpi?.monthly_payments_total ?? 0));
  const monthlyExpenses = Math.round(Number(kpi?.monthly_expenses_total ?? 0));
  const pendingDocuments = Number(kpi?.pending_documents_count ?? 0);

  const catalog = (catalogStones ?? []) as StoneRow[];
  const todos = (todoItems ?? []) as OrderItemViewRow[];

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* 7 כרטיסים: שורה אחת כשיש מקום, אחרת עוטף לשורות מלאות */}
      <div className="grid grid-cols-2 border-b sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]">
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
          valueType="currency"
        />
        <KpiCard
          label="הכנסות החודש"
          value={monthlyRevenue}
          icon="calendar"
          valueType="currency"
        />
        <KpiCard
          label="תשלומים החודש"
          value={monthlyPayments}
          icon="wallet"
          valueType="currency"
        />
        <KpiCard
          label="הוצאות החודש"
          value={monthlyExpenses}
          icon="receipt"
          valueType="currency"
        />
        <Link
          href="/dashboard/documents?status=pending_review"
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&>section]:h-full [&>section]:transition-colors hover:[&>section]:bg-muted/40"
          aria-label={`מסמכים ממתינים לבדיקה: ${pendingDocuments}`}
        >
          <KpiCard
            label="מסמכים לבדיקה"
            value={pendingDocuments}
            icon="inbox"
          />
        </Link>
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-[3] flex-col overflow-auto border-border lg:border-l">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">קטלוג אבנים</h2>
            <p className="text-muted-foreground text-xs">סוגים פעילים במערכת</p>
          </div>
          <ul className="grid list-none gap-3 p-4 sm:grid-cols-3">
            {catalog.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/dashboard/stones/${row.id}/edit`}
                  className="block overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors hover:bg-muted/30 hover:border-muted-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div
                    className="h-36  w-full border-b border-black/10"
                    style={{ backgroundColor: row.color_hex }}
                    aria-hidden
                  />
                  <div className="flex flex-col gap-2 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{row.name}</p>
                      {availStoneIds.has(row.id) ? (
                        <Badge variant="secondary" className="shrink-0">
                          במלאי
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
            {catalog.length === 0 ? (
              <li className="text-muted-foreground col-span-full text-center text-sm py-8">
                אין אבנים בקטלוג. הוסיפו אבן חדשה.
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
          <DashboardOrderTodos items={todos} />
        </div>
      </div>
    </div>
  );
}
