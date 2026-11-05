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

/** תאריך קצר לטבלאות (05.11.2026). מקבל YYYY-MM-DD או ISO מלא. */
export function formatDateShort(value: string | null | undefined): string {
  if (!value) return "—";
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jerusalem",
  }).format(d);
}

/** היום (YYYY-MM-DD) לפי שעון ישראל */
export function todayIsoInIsrael(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
  }).format(new Date());
}

/** האם תאריך יעד (YYYY-MM-DD) כבר עבר */
export function isPastDue(date: string | null | undefined): boolean {
  if (!date) return false;
  return date < todayIsoInIsrael();
}

/** תחילת החודש הנוכחי (00:00 שעון ישראל, כולל שעון קיץ) כ-ISO UTC */
export function startOfMonthInIsraelIso(): string {
  const [y, m] = todayIsoInIsrael().split("-");
  const probe = new Date(`${y}-${m}-01T12:00:00Z`);
  const offset =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      timeZoneName: "longOffset",
    })
      .formatToParts(probe)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+02:00";
  return new Date(`${y}-${m}-01T00:00:00${offset}`).toISOString();
}
