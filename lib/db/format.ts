export function normalizeHex(hex: string): string {
  const t = hex.trim().toLowerCase();
  return t.startsWith("#") ? t : `#${t}`;
}

const ilsFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const ilsDenseFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatIls(n: number): string {
  return ilsFormatter.format(n);
}

export function formatIlsDense(n: number): string {
  return ilsDenseFormatter.format(n);
}

export function formatMeters(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    maximumFractionDigits: 3,
  }).format(n);
}

export function formatVolumeM3(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}
