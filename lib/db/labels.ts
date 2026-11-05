/**
 * תוויות בעברית לכל ה-enums של ה-DB — מקור אחד לכל המסכים.
 * שימוש: `documentKindLabels[row.kind]`, או רשימות לבחירה: `documentKindOptions`.
 */
import type {
  ActivityActionDb,
  CrmRoleDb,
  DeliveryStatusDb,
  DocumentKindDb,
  DocumentSourceDb,
  DocumentStatusDb,
  ExpenseCategoryDb,
  ExpenseDocumentTypeDb,
  OrderChargeKindDb,
  PaymentMethodDb,
  PaymentStatusDb,
} from "@/lib/db/types";

function toOptions<K extends string>(labels: Record<K, string>): { value: K; label: string }[] {
  return (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));
}

// -----------------------------------------------------------------------------
// קיימים (הועברו לכאן מהקומפוננטות)
// -----------------------------------------------------------------------------
export const paymentMethodLabels: Record<PaymentMethodDb, string> = {
  cash: "מזומן",
  bank_transfer: "העברה בנקאית",
  check: "צ׳ק",
  credit_card: "כרטיס אשראי",
  other: "אחר",
};

export const paymentStatusLabels: Record<PaymentStatusDb, string> = {
  unpaid: "לא שולם",
  paid: "שולם",
};

export const deliveryStatusLabels: Record<DeliveryStatusDb, string> = {
  waiting_for_pickup: "ממתין לאיסוף",
  in_transit: "בדרך",
  delivered: "נמסר",
  cancelled: "בוטל",
};

/**
 * סטטוס תשלום לתצוגה, כולל "שולם חלקית" (payment_status נשאר unpaid עד כיסוי מלא).
 */
export function paymentStatusDisplay(row: {
  payment_status: PaymentStatusDb;
  amount_paid?: number | null;
}): string {
  if (row.payment_status === "paid") return paymentStatusLabels.paid;
  if ((row.amount_paid ?? 0) > 0) return "שולם חלקית";
  return paymentStatusLabels.unpaid;
}

// -----------------------------------------------------------------------------
// תפקידים
// -----------------------------------------------------------------------------
export const crmRoleLabels: Record<CrmRoleDb, string> = {
  admin: "מנהל",
  agent: "סוכן (ללא מחיקה)",
};

// -----------------------------------------------------------------------------
// מסמכים
// -----------------------------------------------------------------------------
export const documentKindLabels: Record<DocumentKindDb, string> = {
  customer_invoice: "חשבונית מס שהפקנו ללקוח",
  customer_invoice_receipt: "חשבונית מס/קבלה שהפקנו ללקוח",
  customer_receipt: "קבלה שהפקנו ללקוח",
  customer_credit_note: "חשבונית זיכוי ללקוח",
  supplier_invoice: "חשבונית ספק",
  supplier_receipt: "קבלה מספק",
  supplier_delivery_note: "תעודת משלוח מספק",
  expense_receipt: "קבלה על הוצאה",
  signed_delivery_note: "תעודת משלוח חתומה",
  other: "אחר",
};

/** קיבוץ סוגי מסמכים לפי צד (לסינון / טאבים) */
export const documentKindGroups: { label: string; kinds: DocumentKindDb[] }[] = [
  {
    label: "מסמכים ללקוחות",
    kinds: [
      "customer_invoice",
      "customer_invoice_receipt",
      "customer_receipt",
      "customer_credit_note",
      "signed_delivery_note",
    ],
  },
  {
    label: "מסמכי ספקים והוצאות",
    kinds: ["supplier_invoice", "supplier_receipt", "supplier_delivery_note", "expense_receipt"],
  },
  { label: "אחר", kinds: ["other"] },
];

/** סוגים ששייכים ללקוח (customer_id) לעומת ספק (supplier_id) */
export const customerDocumentKinds: DocumentKindDb[] = [
  "customer_invoice",
  "customer_invoice_receipt",
  "customer_receipt",
  "customer_credit_note",
  "signed_delivery_note",
];
export const supplierDocumentKinds: DocumentKindDb[] = [
  "supplier_invoice",
  "supplier_receipt",
  "supplier_delivery_note",
  "expense_receipt",
];

export const documentStatusLabels: Record<DocumentStatusDb, string> = {
  pending_review: "ממתין לבדיקה",
  processed: "טופל",
  rejected: "נדחה",
};

export const documentSourceLabels: Record<DocumentSourceDb, string> = {
  upload: "הועלה במערכת",
  whatsapp: "וואטסאפ",
  green_invoice: "חשבונית ירוקה",
  system: "מערכת",
};

// -----------------------------------------------------------------------------
// הוצאות
// -----------------------------------------------------------------------------
export const expenseCategoryLabels: Record<ExpenseCategoryDb, string> = {
  stone_purchase: "רכש אבן",
  transport: "הובלות",
  fuel: "דלק",
  vehicle: "רכב",
  maintenance: "תחזוקה ותיקונים",
  rent: "שכירות",
  salaries: "שכר",
  office: "משרד",
  tools: "כלים וציוד",
  professional_services: "שירותים מקצועיים",
  taxes_fees: "מסים ואגרות",
  marketing: "שיווק ופרסום",
  other: "אחר",
};

/** סוגי מסמך הוצאה (קודי Green Invoice) */
export const expenseDocumentTypeLabels: Record<ExpenseDocumentTypeDb, string> = {
  20: "חשבון / אישור תשלום",
  305: "חשבונית מס",
  320: "חשבונית מס/קבלה",
  330: "חשבונית זיכוי",
  400: "קבלה",
  405: "קבלה על תרומה",
};

// -----------------------------------------------------------------------------
// חיובים נוספים בהזמנה
// -----------------------------------------------------------------------------
export const orderChargeKindLabels: Record<OrderChargeKindDb, string> = {
  shipping: "הובלה",
  processing: "עיבוד",
  service: "שירות",
  discount: "הנחה",
  other: "אחר",
};

// -----------------------------------------------------------------------------
// יומן פעולות
// -----------------------------------------------------------------------------
export const activityActionLabels: Record<ActivityActionDb, string> = {
  insert: "יצירה",
  update: "עדכון",
  delete: "מחיקה",
};

export const activityTableLabels: Record<string, string> = {
  stones: "קטלוג אבן",
  customers: "לקוחות",
  customer_stone_prices: "מחירי לקוח",
  suppliers: "ספקים",
  inventory_items: "מלאי",
  orders: "תעודות הזמנה",
  order_items: "פריטי הזמנה",
  order_charges: "חיובים נוספים",
  deliveries: "תעודות משלוח",
  quotes: "הצעות מחיר",
  quote_items: "פריטי הצעת מחיר",
  documents: "מסמכים",
  payments: "תשלומים",
  payment_allocations: "הקצאות תשלום",
  expenses: "הוצאות",
};

// -----------------------------------------------------------------------------
// רשימות {value,label} ל-Select
// -----------------------------------------------------------------------------
export const paymentMethodOptions = toOptions(paymentMethodLabels);
export const documentKindOptions = toOptions(documentKindLabels);
export const documentStatusOptions = toOptions(documentStatusLabels);
export const expenseCategoryOptions = toOptions(expenseCategoryLabels);
export const orderChargeKindOptions = toOptions(orderChargeKindLabels);
export const expenseDocumentTypeOptions = (
  Object.keys(expenseDocumentTypeLabels) as `${ExpenseDocumentTypeDb}`[]
).map((k) => ({
  value: Number(k) as ExpenseDocumentTypeDb,
  label: expenseDocumentTypeLabels[Number(k) as ExpenseDocumentTypeDb],
}));
