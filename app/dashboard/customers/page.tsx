import { CrmDataTable } from "@/components/crm/data-table";
import { KpiCard } from "@/components/kpi-card";
import { createClient } from "@/lib/supabase/server";
import { toHebrewError } from "@/lib/db/errors";

import {
  customerColumnLabels,
  customerColumns,
  type CustomerTableRow,
} from "./columns";

export default async function CustomersPage() {
  const supabase = await createClient();

  // שלוש השאילתות במקביל.
  // הערה: PostgREST מחזיר עד 1000 שורות כברירת מחדל — כשיהיו יותר מ-1000
  // הזמנות/תעודות פתוחות כדאי להעביר את הספירה ל-View מסכם ב-DB.
  const [{ data: customers, error }, { data: ordersRows }, { data: unpaidDeliveries }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("*")
        .eq("is_active", true)
        .order("name"),
      supabase.from("orders").select("customer_id"),
      supabase
        .from("deliveries")
        .select("customer_id, total")
        .eq("payment_status", "unpaid")
        .neq("status", "cancelled"),
    ]);

  const orderCountMap = new Map<string, number>();
  for (const o of ordersRows ?? []) {
    const cid = o.customer_id as string;
    orderCountMap.set(cid, (orderCountMap.get(cid) ?? 0) + 1);
  }

  const unpaidMap = new Map<string, number>();
  for (const d of unpaidDeliveries ?? []) {
    const cid = d.customer_id as string;
    const t = Number(d.total);
    unpaidMap.set(cid, (unpaidMap.get(cid) ?? 0) + t);
  }

  const rows: CustomerTableRow[] = (customers ?? []).map((c) => ({
    ...(c as CustomerTableRow),
    order_count: orderCountMap.get(c.id as string) ?? 0,
    unpaid_balance: unpaidMap.get(c.id as string) ?? 0,
  }));

  const debtorsCount = rows.filter((r) => r.unpaid_balance > 0).length;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="grid border-b grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="לקוחות פעילים"
          value={rows.length}
          icon="users"
        />
        <KpiCard
          label="עם חוב פתוח"
          value={debtorsCount}
          icon="circle-dollar-sign"
        />
        <KpiCard
          label="סך הזמנות"
          value={ordersRows?.length ?? 0}
          icon="package"
        />
        <KpiCard
          label="סך יתרה פתוחה"
          value={Math.round(
            rows.reduce((s, r) => s + r.unpaid_balance, 0)
          )}
          icon="layout-dashboard"
          valueType="currency"
        />
      </div>
      <div className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
        <div className="mx-auto w-full max-w-[min(100%,80rem)]">
          {error ? (
            <p className="text-destructive text-sm">{toHebrewError(error, "טעינת הנתונים נכשלה. נסו לרענן את הדף.")}</p>
          ) : (
            <CrmDataTable
              columns={customerColumns}
              data={rows}
              filterColumnId="name"
              filterPlaceholder="סנן לפי שם לקוח..."
              columnLabels={customerColumnLabels}
              navigateRows="customer-detail"
            />
          )}
        </div>
      </div>
    </div>
  );
}
