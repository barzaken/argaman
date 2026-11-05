import { KpiCard } from "@/components/kpi-card";
import { createClient } from "@/lib/supabase/server";
import { toHebrewError } from "@/lib/db/errors";
import { todayIsoInIsrael } from "@/lib/db/format";
import type { DashboardKpisRow, PaymentViewRow } from "@/lib/db/types";

import { PaymentsTable } from "./payments-table";

const LIMIT = 400;

export default async function PaymentsPage() {
  const supabase = await createClient();

  // YYYY-MM-01 לפי שעון ישראל (paid_at הוא date)
  const monthStart = `${todayIsoInIsrael().slice(0, 8)}01`;

  const [
    { data: rows, error },
    { data: kpiRows },
    { count: monthCount },
    { data: creditRows },
  ] = await Promise.all([
    supabase
      .from("payments_view")
      .select("*")
      .order("paid_at", { ascending: false })
      .order("payment_number", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("dashboard_kpis_view")
      .select("monthly_payments_total, receivables_total")
      .limit(1),
    supabase
      .from("payments")
      .select("*", { count: "exact", head: true })
      .gte("paid_at", monthStart),
    supabase
      .from("payments_view")
      .select("unallocated_amount")
      .gt("unallocated_amount", 0),
  ]);

  const kpis = (kpiRows?.[0] ?? null) as Pick<
    DashboardKpisRow,
    "monthly_payments_total" | "receivables_total"
  > | null;
  const unallocatedTotal =
    Math.round(
      (creditRows ?? []).reduce((s, r) => s + Number(r.unallocated_amount), 0) * 100
    ) / 100;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="grid border-b grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="התקבל החודש"
          value={Number(kpis?.monthly_payments_total ?? 0)}
          icon="wallet"
          valueType="currency"
        />
        <KpiCard
          label="תשלומים החודש"
          value={monthCount ?? 0}
          icon="calendar"
        />
        <KpiCard
          label="זיכוי לא משויך"
          value={unallocatedTotal}
          icon="clipboard-check"
          valueType="currency"
        />
        <KpiCard
          label="יתרה לגבייה"
          value={Number(kpis?.receivables_total ?? 0)}
          icon="file-warning"
          valueType="currency"
        />
      </div>
      <div className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
        <div className="mx-auto w-full max-w-[min(100%,80rem)]">
          {error ? (
            <p className="text-destructive text-sm">
              {toHebrewError(error, "טעינת הנתונים נכשלה. נסו לרענן את הדף.")}
            </p>
          ) : (
            <PaymentsTable
              rows={(rows ?? []) as PaymentViewRow[]}
              truncatedAt={LIMIT}
            />
          )}
        </div>
      </div>
    </div>
  );
}
