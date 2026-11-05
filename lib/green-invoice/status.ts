/**
 * עזרים משותפים לשרת וללקוח (בלי סודות).
 *
 * נעילה נגד הפקה כפולה: לפני שליחה ל-Green Invoice העמודה (deliveries.green_invoice_id /
 * payments.green_invoice_receipt_id / expenses.green_invoice_expense_id) מקבלת ערך זמני
 * "pending:<ms>" בעדכון מותנה (where … is null). רק בקשה אחת מצליחה לתפוס את השורה.
 * בסיום — המזהה האמיתי; בכישלון ודאי — חזרה ל-null. בתשובה לא ודאית (timeout) — הנעילה נשארת,
 * ואחרי כמה דקות הפעולה מחפשת את המסמך ב-Green Invoice לפני שמאפשרת ניסיון חוזר.
 */

export const PENDING_PREFIX = "pending:";
export const CANCELLING_PREFIX = "cancelling:";
/** אחרי כמה זמן נעילה נחשבת "תקועה" */
export const STALE_LOCK_MS = 3 * 60 * 1000;

export function makePendingMarker(now = Date.now()): string {
  return `${PENDING_PREFIX}${now}`;
}

export function makeCancellingMarker(originalId: string, now = Date.now()): string {
  return `${CANCELLING_PREFIX}${now}:${originalId}`;
}

export type GiLockState =
  | { state: "none" }
  | { state: "issued"; id: string }
  | { state: "pending"; since: number; stale: boolean }
  | { state: "cancelling"; since: number; stale: boolean; originalId: string };

export function parseGiId(value: string | null | undefined, now = Date.now()): GiLockState {
  const v = (value ?? "").trim();
  if (!v) return { state: "none" };
  if (v.startsWith(PENDING_PREFIX)) {
    const since = Number(v.slice(PENDING_PREFIX.length)) || 0;
    return { state: "pending", since, stale: now - since > STALE_LOCK_MS };
  }
  if (v.startsWith(CANCELLING_PREFIX)) {
    const rest = v.slice(CANCELLING_PREFIX.length);
    const i = rest.indexOf(":");
    const since = Number(rest.slice(0, i)) || 0;
    return { state: "cancelling", since, stale: now - since > STALE_LOCK_MS, originalId: rest.slice(i + 1) };
  }
  return { state: "issued", id: v };
}

/** true כשיש מסמך אמיתי (לא נעילה זמנית) */
export function hasIssuedGiId(value: string | null | undefined): boolean {
  return parseGiId(value).state === "issued";
}

export const GI_DOCUMENT_TYPE_LABELS: Record<number, string> = {
  305: "חשבונית מס",
  320: "חשבונית מס/קבלה",
  330: "חשבונית זיכוי",
  400: "קבלה",
};

export const GI_EXPENSE_STATUS_LABELS: Record<number, string> = {
  10: "אושרה לדו״ח",
  20: "נכללה בדו״ח",
  30: "נערכה מחדש",
  40: "אושרה ע״י מייצג",
  100: "נמחקה",
};

export const GI_ENV_LABELS = {
  sandbox: "סביבת בדיקות",
  production: "ייצור",
} as const;

/** נתיב דף ההגדרות (קישור "לא מחובר") */
export const GI_SETTINGS_HREF = "/dashboard/settings#green-invoice";
