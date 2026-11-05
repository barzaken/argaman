/** כסף ועיגול לפי שקל */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** נפח במ״ק כשכל המידות כבר במטרים */
export function computeVolumeM3(item: {
  lengthM: number;
  widthM: number;
  heightM: number;
  quantity: number;
}): number {
  const v =
    item.lengthM * item.widthM * item.heightM * item.quantity;
  return Math.round(v * 10000) / 10000;
}

/** נפח במ״ק ממידות בטופס בסנטימטרים (מזינים בשטח שיש בדרך כלל בס״מ) */
export function computeVolumeM3FromCm(item: {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  quantity: number;
}): number {
  const lm = item.lengthCm / 100;
  const wm = item.widthCm / 100;
  const hm = item.heightCm / 100;
  return computeVolumeM3({
    lengthM: lm,
    widthM: wm,
    heightM: hm,
    quantity: item.quantity,
  });
}

/** שטח פנים במ״ר ממידות בטופס בסנטימטרים */
export function computeAreaM2FromCm(item: {
  lengthCm: number;
  widthCm: number;
  quantity: number;
}): number {
  const lm = item.lengthCm / 100;
  const wm = item.widthCm / 100;
  const area = lm * wm * item.quantity;
  return Math.round(area * 10000) / 10000;
}

/** המרת מחיר למ״ר למחיר לקו״ב לפי עובי במטרים (תאימות להזמנות) */
export function derivePricePerM3FromM2(
  pricePerM2: number,
  heightM: number
): number {
  if (heightM <= 0) return 0;
  return Math.round((pricePerM2 / heightM) * 10000) / 10000;
}

/** ערך במטרים מהמסד → מחרוזת לשדה קלט בס״מ */
export function metersToCmInput(m: number): string {
  const cm = Number(m) * 100;
  const rounded = Math.round(cm * 1e9) / 1e9;
  return String(rounded);
}

export function computeLineSubtotal(
  volumeM3: number,
  pricePerM3: number
): number {
  return roundMoney(volumeM3 * pricePerM3);
}

export type QuotePricingUnit = "m3" | "m2" | "unit";

export function computeQuoteLineSubtotal(
  pricingUnit: QuotePricingUnit,
  item: {
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    quantity: number;
  },
  price: number
): number {
  if (pricingUnit === "m3") {
    const vol = computeVolumeM3FromCm({
      lengthCm: item.lengthCm,
      widthCm: item.widthCm,
      heightCm: item.heightCm,
      quantity: item.quantity,
    });
    return computeLineSubtotal(vol, price);
  }
  if (pricingUnit === "m2") {
    const area = computeAreaM2FromCm({
      lengthCm: item.lengthCm,
      widthCm: item.widthCm,
      quantity: item.quantity,
    });
    return roundMoney(area * price);
  }
  return roundMoney(item.quantity * price);
}

export function quotePriceLabel(unit: QuotePricingUnit): string {
  switch (unit) {
    case "m3":
      return "מחיר לקו״ב (₪)";
    case "m2":
      return "מחיר למ״ר (₪)";
    case "unit":
      return "מחיר ליחידה (₪)";
  }
}

export function quoteMeasurePreviewLabel(unit: QuotePricingUnit): string {
  switch (unit) {
    case "m3":
      return "נפח (קו״ב)";
    case "m2":
      return "שטח (מ״ר)";
    case "unit":
      return "כמות";
  }
}

/** נרמול מחיר שורת הצעה למחיר לקו״ב (לתאימות הזמנה / מלאי) */
export function quoteItemPricePerM3ForOrder(item: {
  pricing_unit: QuotePricingUnit;
  length_m: number;
  width_m: number;
  height_m: number;
  price_per_m3: number | null;
  price_per_m2: number | null;
  price_per_unit: number | null;
}): number | null {
  const lengthM = Number(item.length_m);
  const widthM = Number(item.width_m);
  const heightM = Number(item.height_m);
  if (item.pricing_unit === "m3") {
    const p = Number(item.price_per_m3);
    return Number.isNaN(p) ? null : p;
  }
  if (item.pricing_unit === "m2") {
    const p = Number(item.price_per_m2);
    if (Number.isNaN(p) || heightM <= 0) return null;
    return Math.round((p / heightM) * 10000) / 10000;
  }
  const p = Number(item.price_per_unit);
  const vol = lengthM * widthM * heightM;
  if (Number.isNaN(p) || vol <= 0) return null;
  return Math.round((p / vol) * 10000) / 10000;
}

/** מחושב על בסיס סכום לפני מע״מ */
export function computeVatAmount(
  subtotalExVat: number,
  vatRate = 0.18
): number {
  return roundMoney(subtotalExVat * vatRate);
}

export function computeTotalWithVat(
  subtotalExVat: number,
  vatRate = 0.18
): number {
  return roundMoney(subtotalExVat * (1 + vatRate));
}

/** כשמחיר למ״ק כולל מע״מ — להפוך למחיר נטו לפני מע״מ */
export function pricePerM3ExVatFromInclusive(
  priceInclusive: number,
  vatRate = 0.18
): number {
  const factor = 1 + vatRate;
  return Math.round((priceInclusive / factor) * 10000) / 10000;
}

/**
 * מנרמל קלט מספרי מהמשתמש למחרוזת שמתאימה ל-parseFloat/Number:
 * - "4,200" / "12,345.5" (מפריד אלפים) → "4200" / "12345.5"
 * - "1,5" (פסיק עשרוני) → "1.5"
 * - קלט לא חוקי ("12abc", "1.2.3") → "NaN" כדי שהוולידציה תיכשל ולא תנחש מספר.
 */
export function normalizeDecimalInput(raw: string): string {
  const s = raw.trim().replace(/\s+/g, "");
  if (s === "") return "";
  let out: string;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    out = s.replace(/,/g, "");
  } else if (/^\d*,\d+$/.test(s)) {
    out = s.replace(",", ".");
  } else {
    out = s;
  }
  return /^(\d+(\.\d*)?|\.\d+)$/.test(out) ? out : "NaN";
}

/**
 * המרת מחיר בין "לקו״ב" ל"למ״ר" לפי עובי (ס״מ), כשמשתמש מחליף יחידת תמחור.
 * מחזיר את הקלט כמו שהוא אם אין עובי / מחיר תקין.
 */
export function convertUnitPriceInput(
  value: string,
  to: "m3" | "m2",
  heightCm: number
): string {
  const p = parseFloat(normalizeDecimalInput(value));
  const heightM = heightCm / 100;
  if (!value.trim() || Number.isNaN(p) || !(heightM > 0)) return value;
  const converted = to === "m2" ? p * heightM : p / heightM;
  return String(Math.round(converted * 100) / 100);
}
