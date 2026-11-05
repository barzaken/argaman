/**
 * עיבוד שורות activity_log לתצוגה: תוויות עמודות בעברית, עיצוב ערכים,
 * תיאור הרשומה וקישור אליה. רץ בצד השרת (page.tsx).
 */
import { formatDateShort, formatIlsDense } from "@/lib/db/format";
import {
  activityTableLabels,
  crmRoleLabels,
  deliveryStatusLabels,
  documentKindLabels,
  documentSourceLabels,
  documentStatusLabels,
  expenseCategoryLabels,
  orderChargeKindLabels,
  paymentMethodLabels,
  paymentStatusLabels,
} from "@/lib/db/labels";
import type { ActivityActionDb, ActivityLogRow, CrmRoleDb } from "@/lib/db/types";

/** שמות עמודות בעברית ("old → new"). עמודה שלא כאן מוצגת בשמה המקורי. */
const COLUMN_LABELS: Record<string, string> = {
  name: "שם",
  tax_id: "ח.פ / ת״ז",
  email: "דוא״ל",
  phone: "טלפון",
  address: "כתובת",
  notes: "הערות",
  is_active: "פעיל",
  status: "סטטוס",
  priority: "תעדוף",
  supply_due_date: "יעד אספקה",
  signature_url: "קישור חתימה",
  vat_rate: "שיעור מע״מ",
  vat_included: "כולל מע״מ",
  subtotal: "לפני מע״מ",
  vat_amount: "מע״מ",
  total: "סה״כ",
  document_date: "תאריך המסמך",
  payment_status: "סטטוס תשלום",
  payment_method: "אמצעי תשלום",
  payment_due_date: "יעד תשלום",
  fulfillment_method: "אופן אספקה",
  shipping_address: "כתובת משלוח",
  delivered_at: "תאריך מסירה",
  green_invoice_id: "Green Invoice",
  green_invoice_url: "קישור Green Invoice",
  amount: "סכום",
  amount_paid: "שולם",
  paid_at: "תאריך תשלום",
  paid_outside_payments: "שולם מחוץ לתשלומים",
  method: "אמצעי תשלום",
  reference: "אסמכתא",
  bank_name: "בנק",
  kind: "סוג",
  description: "תיאור",
  sort_order: "סדר",
  quantity: "כמות",
  quantity_total: "כמות כוללת",
  quantity_reserved: "מוזמן",
  quantity_delivered: "סופק",
  price_per_m3: "מחיר לקו״ב",
  price_per_m2: "מחיר למ״ר",
  customer_price: "מחיר ללקוח",
  length_m: "אורך",
  width_m: "רוחב",
  height_m: "גובה",
  volume_m3: "נפח",
  area_m2: "שטח",
  line_subtotal: "סכום שורה",
  sku: "מק״ט",
  aliases: "שמות חלופיים",
  color_hex: "צבע",
  valid_until: "בתוקף עד",
  category: "קטגוריה",
  expense_date: "תאריך הוצאה",
  reporting_month: "חודש דיווח",
  amount_total: "סכום כולל",
  amount_before_vat: "לפני מע״מ",
  document_number: "מספר מסמך",
  document_type: "סוג מסמך",
  counterparty_name: "שם הצד השני",
  counterparty_tax_id: "ח.פ הצד השני",
  due_date: "תאריך פירעון",
  is_paid: "שולם",
  file_name: "קובץ",
  source: "מקור",
  currency: "מטבע",
  pricing_unit: "יחידת תמחור",
  finish_level: "רמת גימור",
  piece_type: "סוג חלק",
  expected_arrival_date: "צפי הגעה",
  order_number: "מס׳ הזמנה",
  delivery_number: "מס׳ משלוח",
  quote_number: "מס׳ הצעה",
  payment_number: "מס׳ תשלום",
  stone_id: "אבן",
  customer_id: "לקוח",
  supplier_id: "ספק",
  order_id: "הזמנה",
  delivery_id: "תעודת משלוח",
  payment_id: "תשלום",
  inventory_item_id: "פריט מלאי",
  quote_id: "הצעת מחיר",
  document_id: "מסמך",
  expense_id: "הוצאה",
  converted_order_id: "הזמנה שנוצרה",
  reviewed_at: "נבדק בתאריך",
  green_invoice_receipt_number: "מס׳ קבלה ב-Green Invoice",
};

/** עמודות טכניות שלא מציגים */
const HIDDEN_COLUMNS = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "uploaded_by",
  "reviewed_by",
  "extracted",
  "storage_path",
  "mime_type",
  "file_size",
]);

const MONEY_COLUMNS = new Set([
  "subtotal",
  "vat_amount",
  "total",
  "amount",
  "amount_paid",
  "paid_outside_payments",
  "price_per_m3",
  "price_per_m2",
  "customer_price",
  "line_subtotal",
  "amount_total",
  "amount_before_vat",
]);

/** עדיפות להצגה בסיכום של יצירה / מחיקה */
const SUMMARY_PRIORITY = [
  "name",
  "order_number",
  "delivery_number",
  "quote_number",
  "payment_number",
  "kind",
  "description",
  "document_number",
  "counterparty_name",
  "amount",
  "amount_total",
  "total",
  "status",
  "quantity",
  "price_per_m3",
  "tax_id",
  "document_date",
  "expense_date",
  "paid_at",
  "method",
];

// אין עדיין מפות משותפות לערכים האלה ב-labels.ts (קיימות מקומית במסכים)
const ORDER_STATUS: Record<string, string> = {
  open: "פתוחה",
  in_production: "בייצור",
  ready_for_delivery: "מוכנה למשלוח",
  completed: "הושלמה",
  cancelled: "בוטלה",
};
const ITEM_STATUS: Record<string, string> = {
  pending: "ממתין",
  in_progress: "בעבודה",
  completed: "הושלם",
  cancelled: "בוטל",
};
const QUOTE_STATUS: Record<string, string> = {
  open: "פתוחה",
  converted: "הומרה להזמנה",
  cancelled: "בוטלה",
};
const INVENTORY_STATUS: Record<string, string> = {
  available: "זמין",
  unavailable: "לא זמין",
  in_transit: "בדרך",
};
const PRIORITY: Record<string, string> = { low: "נמוך", medium: "בינוני", urgent: "דחוף" };
const FULFILLMENT: Record<string, string> = { pickup: "איסוף", shipping: "שילוח" };

function enumLabel(table: string, column: string, value: string): string | null {
  switch (column) {
    case "status":
      if (table === "orders") return ORDER_STATUS[value] ?? null;
      if (table === "order_items") return ITEM_STATUS[value] ?? null;
      if (table === "quotes") return QUOTE_STATUS[value] ?? null;
      if (table === "inventory_items") return INVENTORY_STATUS[value] ?? null;
      if (table === "deliveries")
        return deliveryStatusLabels[value as keyof typeof deliveryStatusLabels] ?? null;
      if (table === "documents")
        return documentStatusLabels[value as keyof typeof documentStatusLabels] ?? null;
      return null;
    case "payment_status":
      return paymentStatusLabels[value as keyof typeof paymentStatusLabels] ?? null;
    case "method":
    case "payment_method":
      return paymentMethodLabels[value as keyof typeof paymentMethodLabels] ?? null;
    case "kind":
      if (table === "order_charges")
        return orderChargeKindLabels[value as keyof typeof orderChargeKindLabels] ?? null;
      if (table === "documents")
        return documentKindLabels[value as keyof typeof documentKindLabels] ?? null;
      return null;
    case "category":
      return expenseCategoryLabels[value as keyof typeof expenseCategoryLabels] ?? null;
    case "source":
      return documentSourceLabels[value as keyof typeof documentSourceLabels] ?? null;
    case "priority":
      return PRIORITY[value] ?? null;
    case "fulfillment_method":
      return FULFILLMENT[value] ?? null;
    case "role":
      return crmRoleLabels[value as CrmRoleDb] ?? null;
    default:
      return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T/;

export function formatDateTimeIsrael(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  }).format(d);
}

export function formatActivityValue(table: string, column: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "כן" : "לא";
  if (typeof value === "number") {
    if (column.endsWith("_number")) return String(value);
    if (MONEY_COLUMNS.has(column)) return formatIlsDense(value);
    if (column === "vat_rate") return `${Math.round(value * 100)}%`;
    return new Intl.NumberFormat("he-IL", { maximumFractionDigits: 4 }).format(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "—" : value.map((v) => String(v)).join(", ");
  }
  if (typeof value === "object") {
    const s = JSON.stringify(value);
    return s.length > 60 ? `${s.slice(0, 57)}…` : s;
  }
  const s = String(value);
  const label = enumLabel(table, column, s);
  if (label) return label;
  if (MONEY_COLUMNS.has(column) && !Number.isNaN(Number(s))) return formatIlsDense(Number(s));
  if (DATE_RE.test(s)) return formatDateShort(s);
  if (TS_RE.test(s)) return formatDateTimeIsrael(s);
  if (UUID_RE.test(s)) return `…${s.slice(-6)}`;
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

export function columnLabel(column: string): string {
  return COLUMN_LABELS[column] ?? column;
}

export type ActivityChange = {
  column: string;
  label: string;
  /** update בלבד */
  old?: string;
  value: string;
};

/** update: רק העמודות שהשתנו; insert/delete: עד 6 שדות מייצגים */
export function summarizeChanges(row: ActivityLogRow): ActivityChange[] {
  const changes = row.changes ?? {};
  if (row.action === "update") {
    return Object.entries(changes)
      .filter(([col]) => !HIDDEN_COLUMNS.has(col))
      .map(([col, v]) => {
        const pair = (v ?? {}) as { old?: unknown; new?: unknown };
        return {
          column: col,
          label: columnLabel(col),
          old: formatActivityValue(row.table_name, col, pair.old),
          value: formatActivityValue(row.table_name, col, pair.new),
        };
      });
  }
  const entries = Object.entries(changes).filter(
    ([col, v]) =>
      !HIDDEN_COLUMNS.has(col) &&
      v !== null &&
      v !== "" &&
      !(Array.isArray(v) && v.length === 0) &&
      !(typeof v === "string" && UUID_RE.test(v))
  );
  entries.sort(([a], [b]) => {
    const ia = SUMMARY_PRIORITY.indexOf(a);
    const ib = SUMMARY_PRIORITY.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return entries.slice(0, 6).map(([col, v]) => ({
    column: col,
    label: columnLabel(col),
    value: formatActivityValue(row.table_name, col, v),
  }));
}

/** טבלאות שמזהות "הורה" (לקישור כשהשורה עצמה היא פריט / חיוב) */
export const PARENT_KEYS: Record<string, string> = {
  order_items: "order_id",
  order_charges: "order_id",
  quote_items: "quote_id",
  customer_stone_prices: "customer_id",
  payment_allocations: "delivery_id",
};

/**
 * קישור לרשומה. מסכים של סוכנים אחרים (ספקים / מסמכים / תשלומים / הוצאות)
 * מקשרים כרגע לרשימה — לעדכן כאן כשיהיו להם דפי [id].
 */
export function entityHref(
  table: string,
  rowId: string | null,
  parentId: string | null,
  exists: boolean
): string | null {
  if (table in PARENT_KEYS) {
    if (!parentId) return null;
    const parentTable = PARENT_KEYS[table];
    if (parentTable === "order_id") return `/dashboard/orders/${parentId}`;
    if (parentTable === "quote_id") return `/dashboard/quotes/${parentId}`;
    if (parentTable === "customer_id") return `/dashboard/customers/${parentId}`;
    if (parentTable === "delivery_id") return `/dashboard/deliveries/${parentId}`;
  }
  if (!rowId || !exists) return null;
  switch (table) {
    case "orders":
      return `/dashboard/orders/${rowId}`;
    case "deliveries":
      return `/dashboard/deliveries/${rowId}`;
    case "quotes":
      return `/dashboard/quotes/${rowId}`;
    case "customers":
      return `/dashboard/customers/${rowId}`;
    case "stones":
      return `/dashboard/stones/${rowId}/edit`;
    case "inventory_items":
      return `/dashboard/inventory/${rowId}/edit`;
    case "suppliers":
      return "/dashboard/suppliers";
    case "documents":
      return "/dashboard/documents";
    case "payments":
      return "/dashboard/payments";
    case "expenses":
      return "/dashboard/expenses";
    default:
      return null;
  }
}

export function tableLabel(table: string): string {
  return activityTableLabels[table] ?? table;
}

export type ActivityDisplayRow = {
  id: string;
  at: string;
  at_display: string;
  user_email: string | null;
  user_role: CrmRoleDb | null;
  action: ActivityActionDb;
  table_name: string;
  table_label: string;
  entity_label: string;
  href: string | null;
  changes: ActivityChange[];
};
