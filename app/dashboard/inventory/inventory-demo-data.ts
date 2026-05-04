export type InventoryStatus = "available" | "unavailable" | "in_transit";

export type InventoryItem = {
  id: string;
  /** Hex color value as stored (e.g. #5a4d41). Display uses Hebrew name via map. */
  colorHex: string;
  stoneName: string;
  polishType: string;
  /** מידות במטרים — נפח מחושב כ־אורך × רוחב × גובה × כמות */
  lengthM: number;
  widthM: number;
  heightM: number;
  quantity: number;
  /** מחיר לקוב מעוקב */
  pricePerM3: number;
  /** מחיר כולל ללקוח לשורה (יכול לכלול עיגול/הנחה מול הנוסחה) */
  customerPrice: number;
  status: InventoryStatus;
};

const HEX_COLOR_NAMES: Record<string, string> = {
  "#5a4d41": "חום גרניט",
  "#e8dcc8": "בז׳ קרם",
  "#2f4f4f": "אפור צפחה",
  "#263238": "כסף כהה",
  "#eceff1": "אפור בהיר",
  "#6d4c41": "חום טבעי",
  "#37474f": "כחול־אפור",
  "#ffccbc": "אפרסק בהיר",
};

export function normalizeHex(hex: string): string {
  const t = hex.trim().toLowerCase();
  return t.startsWith("#") ? t : `#${t}`;
}

/** מחזיר שם בעברית לפי טבלת הדמו; אם אין התאמה — מציג את ה־hex */
export function hexToHebrewColorName(hex: string): string {
  const key = normalizeHex(hex);
  return HEX_COLOR_NAMES[key] ?? key.toUpperCase();
}

export function computeVolumeM3(item: Pick<
  InventoryItem,
  "lengthM" | "widthM" | "heightM" | "quantity"
>): number {
  return item.lengthM * item.widthM * item.heightM * item.quantity;
}

export const inventoryDemoData: InventoryItem[] = [
  {
    id: "inv-001",
    colorHex: "#5a4d41",
    stoneName: "גרניט סנטה צ׳לה",
    polishType: "מבריק",
    lengthM: 2.4,
    widthM: 1.35,
    heightM: 0.02,
    quantity: 18,
    pricePerM3: 4200,
    customerPrice: 4899,
    status: "available",
  },
  {
    id: "inv-002",
    colorHex: "#e8dcc8",
    stoneName: "שיש קרארה",
    polishType: "מט",
    lengthM: 3.0,
    widthM: 1.55,
    heightM: 0.02,
    quantity: 12,
    pricePerM3: 8900,
    customerPrice: 9932,
    status: "in_transit",
  },
  {
    id: "inv-003",
    colorHex: "#2f4f4f",
    stoneName: "גרניט אימפריאל גרין",
    polishType: "למינציה",
    lengthM: 1.8,
    widthM: 0.95,
    heightM: 0.03,
    quantity: 22,
    pricePerM3: 5100,
    customerPrice: 5756,
    status: "available",
  },
  {
    id: "inv-004",
    colorHex: "#37474f",
    stoneName: "ברוש טורקיז",
    polishType: "מוברש",
    lengthM: 2.2,
    widthM: 1.2,
    heightM: 0.025,
    quantity: 9,
    pricePerM3: 6700,
    customerPrice: 3980,
    status: "unavailable",
  },
  {
    id: "inv-005",
    colorHex: "#eceff1",
    stoneName: "שיש טאג׳ מאהל",
    polishType: "מבריק",
    lengthM: 2.95,
    widthM: 1.45,
    heightM: 0.018,
    quantity: 14,
    pricePerM3: 7600,
    customerPrice: 8192,
    status: "available",
  },
  {
    id: "inv-006",
    colorHex: "#6d4c41",
    stoneName: "טרוורטין רומאני",
    polishType: "מט",
    lengthM: 1.6,
    widthM: 0.9,
    heightM: 0.035,
    quantity: 30,
    pricePerM3: 3900,
    customerPrice: 5897,
    status: "in_transit",
  },
  {
    id: "inv-007",
    colorHex: "#263238",
    stoneName: "גרניט נוצה כחולה",
    polishType: "מבריק",
    lengthM: 2.1,
    widthM: 1.25,
    heightM: 0.022,
    quantity: 16,
    pricePerM3: 5800,
    customerPrice: 5359,
    status: "available",
  },
  {
    id: "inv-008",
    colorHex: "#ffccbc",
    stoneName: "קוריאן משטח מטבח",
    polishType: "מט",
    lengthM: 3.2,
    widthM: 0.65,
    heightM: 0.012,
    quantity: 25,
    pricePerM3: 12400,
    customerPrice: 7738,
    status: "unavailable",
  },
];
