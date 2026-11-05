import { normalizeDecimalInput } from "@/lib/db/calculations";
import type { DebtorsViewRow, PaymentAllocationInput } from "@/lib/db/types";

/** תעודת משלוח פתוחה (יתרה > 0) שאפשר לשייך אליה תשלום */
export type OpenDelivery = Pick<
  DebtorsViewRow,
  | "delivery_id"
  | "delivery_number"
  | "order_number"
  | "customer_id"
  | "payment_due_date"
  | "total"
  | "amount_paid"
  | "balance"
>;

/** סכום שהוזן בשדה → מספר (ריק = 0, לא תקין = NaN) */
export function parseMoneyInput(raw: string): number {
  const s = normalizeDecimalInput(raw);
  if (s === "") return 0;
  return Number(s);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** מהישן לחדש: לפי מספר תעודה (סדר הפקה) */
export function sortOldestFirst<T extends { delivery_number: number }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => a.delivery_number - b.delivery_number);
}

/** שיוך אוטומטי: ממלא את היתרות מהתעודה הישנה לחדשה עד גובה הסכום */
export function autoAllocate(
  deliveries: OpenDelivery[],
  amount: number
): Record<string, string> {
  const out: Record<string, string> = {};
  let left = round2(Math.max(0, amount));
  for (const d of sortOldestFirst(deliveries)) {
    if (left <= 0) break;
    const take = round2(Math.min(Number(d.balance), left));
    if (take > 0) {
      out[d.delivery_id] = take.toFixed(2);
      left = round2(left - take);
    }
  }
  return out;
}

export type AllocationCheck = {
  allocations: PaymentAllocationInput[];
  allocated: number;
  /** שגיאה לכל תעודה (סכום לא תקין / גדול מהיתרה) */
  rowErrors: Record<string, string>;
};

export function checkAllocations(
  deliveries: OpenDelivery[],
  values: Record<string, string>
): AllocationCheck {
  const allocations: PaymentAllocationInput[] = [];
  const rowErrors: Record<string, string> = {};
  let allocated = 0;
  for (const d of deliveries) {
    const raw = values[d.delivery_id] ?? "";
    if (raw.trim() === "") continue;
    const n = parseMoneyInput(raw);
    if (!Number.isFinite(n) || n < 0) {
      rowErrors[d.delivery_id] = "סכום לא תקין";
      continue;
    }
    if (n === 0) continue;
    const amount = round2(n);
    if (amount > Number(d.balance) + 0.005) {
      rowErrors[d.delivery_id] =
        `הסכום גדול מיתרת התעודה (${Number(d.balance).toFixed(2)} ₪)`;
    }
    allocations.push({ delivery_id: d.delivery_id, amount });
    allocated = round2(allocated + amount);
  }
  return { allocations, allocated, rowErrors };
}
