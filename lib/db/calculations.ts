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
