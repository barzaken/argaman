import { CrmDataTable } from "@/components/crm/data-table";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
import {
  currentMonthIso,
  expenseMonth,
  formatMonth,
  sumBy,
} from "@/components/expenses/expense-utils";
import { KpiCard } from "@/components/kpi-card";
import { createClient } from "@/lib/supabase/server";
import { toHebrewError } from "@/lib/db/errors";
import type { ExpenseViewRow } from "@/lib/db/types";

import { expenseColumnLabels, expenseColumns } from "./columns";

const LIMIT = 3000;

function lastMonths(from: string, count: number): string[] {
  const [y, m] = from.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; category?: string; paid?: string }>;
}) {
  const sp = await searchParams;
  const nowMonth = currentMonthIso();
  const month =
    sp.month === "all" || (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) ? sp.month : nowMonth;
  const category = sp.category ?? "all";
  const paid = sp.paid === "paid" || sp.paid === "unpaid" ? sp.paid : "all";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses_view")
    .select("*")
    .order("expense_date", { ascending: false })
    .limit(LIMIT);

  const all = (data ?? []) as ExpenseViewRow[];
  const inMonth = month === "all" ? all : all.filter((e) => expenseMonth(e) === month);
  const rows = inMonth.filter(
    (e) =>
      (category === "all" || e.category === category) &&
      (paid === "all" || (paid === "paid" ? e.is_paid : !e.is_paid))
  );

  // KPI לפי החודש והקטגוריה שנבחרו (בלי מסנן התשלום)
  const kpiRows = inMonth.filter((e) => category === "all" || e.category === category);
  const monthLabel =
    month === "all" ? "סך הוצאות" : month === nowMonth ? "הוצאות החודש" : `הוצאות ${formatMonth(month)}`;
  const unpaidAll = all.filter(
    (e) => !e.is_paid && (category === "all" || e.category === category)
  );

  const monthOptions = Array.from(
    new Set([...lastMonths(nowMonth, 24), ...all.map(expenseMonth)])
  ).sort((a, b) => b.localeCompare(a));

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="grid border-b grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={`${monthLabel} (כולל מע״מ)`}
          value={Math.round(sumBy(kpiRows, (e) => e.amount_total))}
          icon="receipt"
          valueType="currency"
        />
        <KpiCard
          label="לפני מע״מ"
          value={Math.round(sumBy(kpiRows, (e) => e.amount_before_vat))}
          icon="circle-dollar-sign"
          valueType="currency"
        />
        <KpiCard
          label="מע״מ"
          value={Math.round(sumBy(kpiRows, (e) => e.vat_amount))}
          icon="layout-dashboard"
          valueType="currency"
        />
        <KpiCard
          label={`לא שולמו (${unpaidAll.length})`}
          value={Math.round(sumBy(unpaidAll, (e) => e.amount_total))}
          icon="file-warning"
          valueType="currency"
        />
      </div>
      <div className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
        <div className="mx-auto flex w-full max-w-[min(100%,80rem)] flex-col gap-4">
          <ExpenseFilters
            month={month}
            category={category}
            paid={paid}
            monthOptions={monthOptions}
            defaultMonth={nowMonth}
          />
          {error ? (
            <p className="text-destructive text-sm">
              {toHebrewError(error, "טעינת הנתונים נכשלה. נסו לרענן את הדף.")}
            </p>
          ) : (
            <CrmDataTable
              columns={expenseColumns}
              data={rows}
              filterPlaceholder="חיפוש לפי ספק, תיאור, מספר מסמך, סכום…"
              navigateRows="expense-detail"
              columnLabels={expenseColumnLabels}
              truncatedAt={all.length >= LIMIT ? LIMIT : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}
