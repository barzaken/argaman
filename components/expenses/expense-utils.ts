import type { ExpenseRow } from "@/lib/db/types";
import { todayIsoInIsrael } from "@/lib/db/format";

/** חודש הדיווח של הוצאה (YYYY-MM) — reporting_month, ואם חסר לפי תאריך ההוצאה */
export function expenseMonth(
  row: Pick<ExpenseRow, "reporting_month" | "expense_date">
): string {
  return (row.reporting_month ?? row.expense_date).slice(0, 7);
}

/** החודש הנוכחי (YYYY-MM) לפי שעון ישראל */
export function currentMonthIso(): string {
  return todayIsoInIsrael().slice(0, 7);
}

/** "2026-11" → "11/2026" */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-");
  return y && m ? `${m}/${y}` : month;
}

export function sumBy<T>(rows: T[], pick: (r: T) => number | null | undefined): number {
  return Math.round(rows.reduce((s, r) => s + Number(pick(r) ?? 0), 0) * 100) / 100;
}
