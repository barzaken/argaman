import { CrmDataTable } from "@/components/crm/data-table";
import { KpiCard } from "@/components/kpi-card";
import { createClient } from "@/lib/supabase/server";
import type { QuoteViewRow } from "@/lib/db/types";

import { quotesColumnLabels, quotesColumns } from "./columns";

export default async function QuotesPage() {
  const supabase = await createClient();

  const { data: quotes, error } = await supabase
    .from("quotes_view")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(400);

  const list = (quotes ?? []) as QuoteViewRow[];

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: openQuotes } = await supabase
    .from("quotes")
    .select("*", { count: "exact", head: true })
    .eq("status", "open");

  const { count: convertedQuotes } = await supabase
    .from("quotes")
    .select("*", { count: "exact", head: true })
    .eq("status", "converted");

  const { count: monthCount } = await supabase
    .from("quotes")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startOfMonth.toISOString());

  const openTotal = list
    .filter((q) => q.status === "open")
    .reduce((sum, q) => sum + Number(q.total), 0);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="grid border-b grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="הצעות פתוחות"
          value={openQuotes ?? 0}
          icon="layout-dashboard"
        />
        <KpiCard
          label="הומרו להזמנה"
          value={convertedQuotes ?? 0}
          icon="clipboard-check"
        />
        <KpiCard
          label="סך הצעות החודש"
          value={monthCount ?? 0}
          icon="calendar"
        />
        <KpiCard
          label="סכום הצעות פתוחות"
          value={openTotal}
          icon="factory"
          valueType="currency"
        />
      </div>
      <div className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
        <div className="mx-auto w-full max-w-[min(100%,80rem)]">
          {error ? (
            <p className="text-destructive text-sm">{error.message}</p>
          ) : (
            <CrmDataTable
              columns={quotesColumns}
              data={list}
              filterColumnId="customer_name"
              filterPlaceholder="סנן לפי לקוח..."
              columnLabels={quotesColumnLabels}
              navigateRows="quote-detail"
            />
          )}
        </div>
      </div>
    </div>
  );
}
