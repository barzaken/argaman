import Link from "next/link";

import { CrmDataTable } from "@/components/crm/data-table";
import { KpiCard } from "@/components/kpi-card";
import { Button } from "@/components/ui/button";
import { currentMonthIso, expenseMonth, sumBy } from "@/components/expenses/expense-utils";
import { createClient } from "@/lib/supabase/server";
import { toHebrewError } from "@/lib/db/errors";
import type { ExpenseRow, SupplierRow } from "@/lib/db/types";

import {
  supplierColumnLabels,
  supplierColumns,
  type SupplierTableRow,
} from "./columns";

type ExpenseLite = Pick<
  ExpenseRow,
  "supplier_id" | "amount_total" | "is_paid" | "expense_date" | "reporting_month"
>;

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const supabase = await createClient();

  const [{ data: suppliers, error }, { data: expenses }] = await Promise.all([
    supabase.from("suppliers").select("*").order("name"),
    supabase
      .from("expenses")
      .select("supplier_id, amount_total, is_paid, expense_date, reporting_month")
      .limit(5000),
  ]);

  const allExpenses = (expenses ?? []) as ExpenseLite[];
  const bySupplier = new Map<string, ExpenseLite[]>();
  for (const e of allExpenses) {
    if (!e.supplier_id) continue;
    const list = bySupplier.get(e.supplier_id) ?? [];
    list.push(e);
    bySupplier.set(e.supplier_id, list);
  }

  const allSuppliers = (suppliers ?? []) as SupplierRow[];
  const rows: SupplierTableRow[] = allSuppliers
    .filter((s) => (showArchived ? !s.is_active : s.is_active))
    .map((s) => {
      const list = bySupplier.get(s.id) ?? [];
      return {
        ...s,
        expense_count: list.length,
        expense_total: sumBy(list, (e) => e.amount_total),
        unpaid_total: sumBy(
          list.filter((e) => !e.is_paid),
          (e) => e.amount_total
        ),
      };
    });

  const month = currentMonthIso();
  const supplierExpenses = allExpenses.filter((e) => e.supplier_id);
  const monthTotal = sumBy(
    supplierExpenses.filter((e) => expenseMonth(e) === month),
    (e) => e.amount_total
  );
  const unpaidTotal = sumBy(
    supplierExpenses.filter((e) => !e.is_paid),
    (e) => e.amount_total
  );
  const archivedCount = allSuppliers.filter((s) => !s.is_active).length;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="grid border-b grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="ספקים פעילים"
          value={allSuppliers.length - archivedCount}
          icon="factory"
        />
        <KpiCard
          label="הוצאות החודש (ספקים)"
          value={Math.round(monthTotal)}
          icon="calendar"
          valueType="currency"
        />
        <KpiCard
          label="הוצאות לא שולמו"
          value={Math.round(unpaidTotal)}
          icon="file-warning"
          valueType="currency"
        />
        <KpiCard label="ספקים בארכיון" value={archivedCount} icon="package-open" />
      </div>
      <div className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
        <div className="mx-auto flex w-full max-w-[min(100%,80rem)] flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm">
              {showArchived ? "מוצגים ספקים בארכיון." : "מוצגים ספקים פעילים."}
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href={showArchived ? "/dashboard/suppliers" : "/dashboard/suppliers?archived=1"}>
                {showArchived ? "הצגת ספקים פעילים" : `הצגת ארכיון (${archivedCount})`}
              </Link>
            </Button>
          </div>
          {error ? (
            <p className="text-destructive text-sm">
              {toHebrewError(error, "טעינת הנתונים נכשלה. נסו לרענן את הדף.")}
            </p>
          ) : (
            <CrmDataTable
              columns={supplierColumns}
              data={rows}
              filterColumnId="name"
              filterPlaceholder="סנן לפי שם ספק..."
              columnLabels={supplierColumnLabels}
            />
          )}
        </div>
      </div>
    </div>
  );
}
