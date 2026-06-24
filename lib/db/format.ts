import { metersToCmInput } from "./calculations";

export function normalizeHex(hex: string): string {
  const t = hex.trim().toLowerCase();
  return t.startsWith("#") ? t : `#${t}`;
}

function formatHeAmountDigits(
  n: number,
  fraction: "integer" | "dense"
): string {
  const opts: Intl.NumberFormatOptions =
    fraction === "integer"
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: 0, maximumFractionDigits: 2 };
  return new Intl.NumberFormat("he-IL", opts).format(n);
}

/**
 * מציג סכום בשקלים עם סימון ‎₪‎ (ספרות בכיוון LTR בעברית).
 */
export function formatIls(n: number): string {
  return `\u200E${formatHeAmountDigits(n, "integer")}\u00A0₪`;
}

export function formatIlsDense(n: number): string {
  return `\u200E${formatHeAmountDigits(n, "dense")}\u00A0₪`;
}

export function formatMeters(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    maximumFractionDigits: 3,
  }).format(n);
}

/** מידות במטרים מהמסד → תצוגה בסנטימטרים (אורך×רוחב×גובה, משמאל לימין) */
export function formatDimensionsCmFromMeters(
  lengthM: number,
  widthM: number,
  heightM: number
): string {
  return `\u200E${metersToCmInput(lengthM)}×${metersToCmInput(widthM)}×${metersToCmInput(heightM)}`;
}

export function formatAreaM2(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

export function formatVolumeM3(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

/** תאריך הנפקת מסמך (למשל תעודת משלוח) — לפי שעון ישראל */
export function formatIssueDate(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "long",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(iso));
}
