/**
 * המרת נתוני ה-CRM לגופי בקשה של Green Invoice (Morning).
 * פונקציות טהורות — בלי רשת ובלי DB — כדי שאפשר יהיה לבדוק אותן
 * (lib/green-invoice/__tests__/mappers.test.mjs, מריצים: node --test lib/green-invoice/__tests__/mappers.test.mjs).
 *
 * החלטות (ראו docs ב-spec הרשמי, morning API):
 * - מחירי ה-CRM לפני מע״מ → בשורת הכנסה vatType = 0 ("Default" — מע״מ מתווסף על המחיר).
 *   (vatType = 1 בשורה = המחיר כולל מע״מ; 2 = פטור.)
 * - vatType ברמת המסמך: 0 = לפי סוג העסק (רגיל), 1 = פטור. אין ברמת המסמך "כולל מע״מ".
 * - הנחות (order_charges מסוג discount, סכום שלילי) נשלחות כשורת הכנסה במחיר שלילי
 *   כדי שסכום השורות יהיה זהה לסכום התעודה. (discount ברמת המסמך מוגדר ב-spec כ"לא כולל מע״מ" —
 *   משמעות לא חד-משמעית, לכן לא בשימוש.)
 * - כל הסכומים מעוגלים ל-2 ספרות; אם סכום השורות לא תואם לסכום התעודה ב-CRM (סטייה > 0.01) — עוצרים.
 */

// ---------------------------------------------------------------------------
// טיפוסים — גופי הבקשה של Morning (רק השדות שבשימוש)
// ---------------------------------------------------------------------------
export type GiDocumentType = 305 | 320 | 330 | 400;
export type GiIncomeVatType = 0 | 1 | 2;

export type GiIncomeRow = {
  description: string;
  quantity: number;
  price: number;
  currency: "ILS";
  vatType: GiIncomeVatType;
  vatRate?: number;
  catalogNum?: string;
};

export type GiPaymentRow = {
  date: string;
  type: number;
  price: number;
  currency: "ILS";
  chequeNum?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccount?: string;
  cardType?: number;
  cardNum?: string;
  dealType?: number;
  numPayments?: number;
  transactionId?: string;
};

export type GiClientRef = {
  id?: string;
  name?: string;
  taxId?: string;
  emails?: string[];
  address?: string;
  phone?: string;
  country?: string;
  add?: boolean;
};

export type GiDocumentRequest = {
  type: GiDocumentType;
  date?: string;
  dueDate?: string;
  lang: "he";
  currency: "ILS";
  vatType: 0 | 1 | 2;
  description?: string;
  remarks?: string;
  client: GiClientRef;
  income: GiIncomeRow[];
  payment?: GiPaymentRow[];
  linkedDocumentIds?: string[];
  linkType?: "link" | "cancel";
  signed: boolean;
  attachment: boolean;
};

export type GiClientRequest = {
  name: string;
  taxId?: string;
  emails?: string[];
  phone?: string;
  address?: string;
  country: "IL";
  send?: boolean;
  remarks?: string;
};

export type GiAccountingClassification = {
  id: string;
  key?: string;
  code?: string;
  title: string;
  irsCode?: number;
  type?: number;
  income?: number;
  vat?: number;
  mixed?: number;
};

export type GiSupplierRequest = {
  id?: string;
  name: string;
  taxId?: string;
  emails?: string[];
  phone?: string;
  address?: string;
  country?: "IL";
  add?: boolean;
};

export type GiExpenseRequest = {
  documentType: number;
  number: string;
  date: string;
  reportingDate: string;
  paymentType: number;
  currency: string;
  amount: number;
  vat?: number;
  description?: string;
  remarks?: string;
  supplier: GiSupplierRequest;
  accountingClassification: GiAccountingClassification | { id: string };
  pcnClassification: "T";
  active: true;
};

// ---------------------------------------------------------------------------
// טיפוסי קלט מה-CRM (תת-קבוצה של העמודות ב-lib/db/types.ts)
// ---------------------------------------------------------------------------
export type CrmPaymentMethod = "cash" | "bank_transfer" | "check" | "credit_card" | "other";

export type CrmDeliveryLine = {
  stone_name: string;
  length_m: number;
  width_m: number;
  height_m: number;
  quantity: number;
  volume_m3: number;
  price_per_m3: number;
  line_subtotal: number;
  inventory_pricing_unit?: "m3" | "m2" | null;
};

export type CrmOrderCharge = {
  kind: "shipping" | "processing" | "service" | "discount" | "other";
  description: string;
  amount: number;
  sort_order?: number | null;
};

export type CrmDeliveryForInvoice = {
  delivery_number: number;
  order_number: number;
  status: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  payment_due_date: string | null;
};

export type CrmCustomer = {
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

/** שורת תשלום אחת (מ-payments / payment_allocations / תשלום מחוץ לטבלה) */
export type CrmPaymentLine = {
  date: string;
  method: CrmPaymentMethod | null;
  amount: number;
  reference: string | null;
  bank_name: string | null;
  /** פרטי צ׳ק נוספים שהמשתמש הזין בדיאלוג */
  bank_branch?: string | null;
  bank_account?: string | null;
  /** לתצוגת שגיאה: "תשלום 1004" */
  label: string;
};

export class GiMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GiMappingError";
  }
}

// ---------------------------------------------------------------------------
// עזרים
// ---------------------------------------------------------------------------
export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export const DEFAULT_VAT_RATE = 0.18;

/** אמצעי תשלום CRM → PaymentGroup של Morning. 'other' → null (אין מיפוי חד-משמעי). */
export const PAYMENT_METHOD_TO_GI: Record<CrmPaymentMethod, number | null> = {
  cash: 1,
  check: 2,
  credit_card: 3,
  bank_transfer: 4,
  other: null,
};

/** אמצעי תשלום CRM → ExpensePaymentType (-1 = לא שולם) */
export const EXPENSE_PAYMENT_TYPE: Record<CrmPaymentMethod, number> = {
  cash: 1,
  check: 2,
  credit_card: 3,
  bank_transfer: 4,
  other: 11,
};

export const GI_DOCUMENT_KIND: Record<GiDocumentType, string> = {
  305: "customer_invoice",
  320: "customer_invoice_receipt",
  330: "customer_credit_note",
  400: "customer_receipt",
};

const cm = (m: number) => {
  const v = Math.round(Number(m) * 1000) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

const fmtQty = (n: number, digits: number) =>
  Number(n).toLocaleString("en-US", { maximumFractionDigits: digits, useGrouping: false });

function lineDescription(ln: CrmDeliveryLine, includePieces: boolean): string {
  const parts = [
    ln.stone_name.trim(),
    `${cm(ln.length_m)}×${cm(ln.width_m)}×${cm(ln.height_m)} ס״מ`,
  ];
  if (includePieces) parts.push(`${ln.quantity} יח׳`);
  if (ln.inventory_pricing_unit === "m2") {
    const area = Number(ln.length_m) * Number(ln.width_m) * Number(ln.quantity);
    parts.push(`${fmtQty(area, 3)} מ״ר`);
  } else {
    parts.push(`${fmtQty(ln.volume_m3, 4)} קו״ב`);
  }
  return parts.join(" · ");
}

/**
 * שורת אבן אחת. כמות = מספר היחידות כשהסכום מתחלק בדיוק (אגורות שלמות),
 * אחרת כמות 1 ומחיר = סכום השורה (והכמות נכתבת בתיאור) — כך quantity × price = line_subtotal תמיד.
 */
export function deliveryLineToIncome(ln: CrmDeliveryLine, vatType: GiIncomeVatType): GiIncomeRow {
  const total = round2(ln.line_subtotal);
  const pieces = Math.trunc(Number(ln.quantity));
  const cents = Math.round(total * 100);
  if (pieces > 1 && cents % pieces === 0) {
    return {
      description: lineDescription(ln, false),
      quantity: pieces,
      price: cents / pieces / 100,
      currency: "ILS",
      vatType,
    };
  }
  return {
    description: lineDescription(ln, pieces > 1),
    quantity: 1,
    price: total,
    currency: "ILS",
    vatType,
  };
}

export function chargeToIncome(ch: CrmOrderCharge, vatType: GiIncomeVatType): GiIncomeRow | null {
  const amount = round2(ch.amount);
  if (amount === 0) return null;
  return {
    description: ch.description.trim() || (ch.kind === "discount" ? "הנחה" : "חיוב נוסף"),
    quantity: 1,
    price: amount,
    currency: "ILS",
    vatType,
  };
}

export function incomeRowsTotal(rows: GiIncomeRow[]): number {
  return round2(rows.reduce((s, r) => s + round2(r.quantity * r.price), 0));
}

/** תאריך YYYY-MM-DD היום בשעון ישראל */
export function israelToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now);
}

export function firstOfMonth(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new GiMappingError("תאריך לא תקין");
  return `${date.slice(0, 7)}-01`;
}

export function normalizeTaxId(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** עד 3 כתובות תקינות וייחודיות (Morning: שגיאה 2200 מעל 3) */
export function cleanEmails(list: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    for (const part of String(raw ?? "").split(/[,;\s]+/)) {
      const e = part.trim().toLowerCase();
      if (e && EMAIL_RE.test(e) && !out.includes(e)) out.push(e);
    }
  }
  return out.slice(0, 3);
}

// ---------------------------------------------------------------------------
// לקוחות
// ---------------------------------------------------------------------------
export function buildClientRequest(c: CrmCustomer, crmCustomerId?: string): GiClientRequest {
  const name = c.name.trim();
  if (!name) throw new GiMappingError("ללקוח אין שם");
  const req: GiClientRequest = { name, country: "IL", send: false };
  const taxId = normalizeTaxId(c.tax_id);
  if (taxId) req.taxId = String(c.tax_id).replace(/\D/g, "");
  const emails = cleanEmails([c.email]);
  if (emails.length) req.emails = emails;
  if (c.phone?.trim()) req.phone = c.phone.trim();
  if (c.address?.trim()) req.address = c.address.trim();
  if (crmCustomerId) req.remarks = `CRM ${crmCustomerId}`;
  return req;
}

/**
 * חיפוש לקוחות ב-Morning הוא לפי שם בלבד (אין מסנן taxId) — בוחרים מהתוצאות לפי ח.פ.
 * בלי ח.פ ב-CRM: התאמה לשם מדויק בלבד. מחזיר null כשאין התאמה ודאית.
 */
export function pickClientMatch(
  items: { id?: string; name?: string; taxId?: string | null; active?: boolean }[],
  c: CrmCustomer
): string | null {
  const tax = normalizeTaxId(c.tax_id);
  const candidates = items.filter((i) => typeof i.id === "string" && i.id);
  if (tax) {
    const hit = candidates.filter((i) => normalizeTaxId(i.taxId) === tax);
    const active = hit.find((i) => i.active !== false);
    return (active ?? hit[0])?.id ?? null;
  }
  const name = c.name.trim();
  const hit = candidates.filter((i) => (i.name ?? "").trim() === name && !normalizeTaxId(i.taxId));
  return hit.length === 1 ? hit[0].id! : null;
}

export function clientRefForDocument(
  clientId: string | null,
  c: CrmCustomer,
  emails: string[] | null
): GiClientRef {
  const mails = emails ? cleanEmails(emails) : [];
  if (clientId) {
    return mails.length ? { id: clientId, emails: mails } : { id: clientId };
  }
  // ללא מזהה (תצוגה מקדימה בלבד) — פרטים מלאים, בלי add
  const base = buildClientRequest(c);
  return {
    name: base.name,
    ...(base.taxId ? { taxId: base.taxId } : {}),
    ...(base.address ? { address: base.address } : {}),
    ...(base.phone ? { phone: base.phone } : {}),
    country: "IL",
    ...(mails.length ? { emails: mails } : {}),
  };
}

// ---------------------------------------------------------------------------
// תשלומים
// ---------------------------------------------------------------------------
export function paymentLineToGi(p: CrmPaymentLine, today: string): GiPaymentRow {
  const price = round2(p.amount);
  if (!(price > 0)) throw new GiMappingError(`${p.label}: סכום התשלום חייב להיות חיובי`);
  if (!p.method) throw new GiMappingError(`${p.label}: לא הוגדר אמצעי תשלום`);
  const type = PAYMENT_METHOD_TO_GI[p.method];
  if (type === null) {
    throw new GiMappingError(
      `${p.label}: אמצעי התשלום "אחר" אינו נתמך במסמך Green Invoice — עדכנו את אמצעי התשלום (מזומן / צ׳ק / העברה / אשראי)`
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) throw new GiMappingError(`${p.label}: תאריך תשלום לא תקין`);
  if (p.date > today) throw new GiMappingError(`${p.label}: תאריך התשלום עתידי (${p.date})`);

  const row: GiPaymentRow = { date: p.date, type, price, currency: "ILS" };
  const ref = p.reference?.trim() || "";
  const bank = p.bank_name?.trim() || "";
  const branch = p.bank_branch?.trim() || "";
  const account = p.bank_account?.trim() || "";
  if (p.method === "check") {
    if (!ref) throw new GiMappingError(`${p.label}: חסר מספר צ׳ק (אסמכתא)`);
    if (!bank) throw new GiMappingError(`${p.label}: חסר שם בנק לצ׳ק`);
    row.chequeNum = ref;
    row.bankName = bank;
    if (branch) row.bankBranch = branch;
    if (account) row.bankAccount = account;
  } else if (p.method === "bank_transfer") {
    if (bank) row.bankName = bank;
    if (branch) row.bankBranch = branch;
    if (account) row.bankAccount = account;
  } else if (p.method === "credit_card") {
    row.cardType = 0; // לא ידוע
    row.dealType = 1; // רגילה
    row.numPayments = 1;
    const digits = ref.replace(/\D/g, "");
    if (digits.length >= 4 && ref.replace(/[\s*-]/g, "").length <= 6) row.cardNum = digits.slice(-4);
  }
  return row;
}

// ---------------------------------------------------------------------------
// חשבונית מס 305 / חשבונית מס-קבלה 320 / זיכוי 330
// ---------------------------------------------------------------------------
export type InvoiceBuildInput = {
  type: 305 | 320;
  delivery: CrmDeliveryForInvoice;
  lines: CrmDeliveryLine[];
  charges: CrmOrderCharge[];
  vatRate: number;
  customer: CrmCustomer;
  clientId: string | null;
  /** null = לא לשלוח מייל */
  emails: string[] | null;
  remarks?: string | null;
  /** חובה ל-320: כל התשלומים שמכסים את התעודה */
  payments?: CrmPaymentLine[];
  today?: string;
};

export type BuiltDocument = {
  payload: GiDocumentRequest;
  amountBeforeVat: number;
  vatAmount: number;
  amountTotal: number;
};

export function buildIncomeRowsForDelivery(
  lines: CrmDeliveryLine[],
  charges: CrmOrderCharge[],
  vatRate: number
): { rows: GiIncomeRow[]; vatType: GiIncomeVatType } {
  const rate = Number(vatRate);
  const vatType: GiIncomeVatType = rate === 0 ? 2 : 0;
  const rows: GiIncomeRow[] = lines.map((ln) => deliveryLineToIncome(ln, vatType));
  const sorted = [...charges].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  // הנחות אחרי החיובים
  for (const ch of sorted.filter((c) => c.kind !== "discount")) {
    const r = chargeToIncome(ch, vatType);
    if (r) rows.push(r);
  }
  for (const ch of sorted.filter((c) => c.kind === "discount")) {
    const r = chargeToIncome(ch, vatType);
    if (r) rows.push(r);
  }
  if (rate > 0 && Math.abs(rate - DEFAULT_VAT_RATE) > 1e-9) {
    for (const r of rows) r.vatRate = rate;
  }
  return { rows, vatType };
}

export function buildInvoicePayload(input: InvoiceBuildInput): BuiltDocument {
  const { delivery } = input;
  const today = input.today ?? israelToday();
  if (delivery.status === "cancelled") throw new GiMappingError("התעודה מבוטלת — אין להפיק לה חשבונית");
  if (!input.lines.length) throw new GiMappingError("אין שורות בתעודת המשלוח");

  const { rows, vatType } = buildIncomeRowsForDelivery(input.lines, input.charges, input.vatRate);
  const subtotal = incomeRowsTotal(rows);
  if (Math.abs(subtotal - round2(delivery.subtotal)) > 0.01) {
    throw new GiMappingError(
      `סכום השורות (${subtotal.toFixed(2)}) אינו תואם לסכום התעודה לפני מע״מ (${round2(delivery.subtotal).toFixed(2)})`
    );
  }
  if (!(subtotal > 0)) throw new GiMappingError("סכום התעודה חייב להיות חיובי");
  const vat = round2(subtotal * Number(input.vatRate));
  const total = round2(subtotal + vat);
  if (Math.abs(total - round2(delivery.total)) > 0.01) {
    throw new GiMappingError(
      `סכום כולל מע״מ (${total.toFixed(2)}) אינו תואם לסכום התעודה (${round2(delivery.total).toFixed(2)})`
    );
  }

  const payload: GiDocumentRequest = {
    type: input.type,
    date: today,
    lang: "he",
    currency: "ILS",
    vatType: vatType === 2 ? 1 : 0,
    description: `תעודת משלוח ${delivery.delivery_number} · הזמנה ${delivery.order_number}`,
    client: clientRefForDocument(input.clientId, input.customer, input.emails),
    income: rows,
    signed: true,
    attachment: !!(input.emails && cleanEmails(input.emails).length),
  };
  if (input.type === 305 && delivery.payment_due_date && delivery.payment_due_date >= today) {
    payload.dueDate = delivery.payment_due_date;
  }
  const remarks = input.remarks?.trim();
  if (remarks) payload.remarks = remarks;

  if (input.type === 320) {
    const pays = input.payments ?? [];
    if (!pays.length) throw new GiMappingError("חשבונית מס/קבלה דורשת תשלום רשום שמכסה את התעודה");
    payload.payment = pays.map((p) => paymentLineToGi(p, today));
    const paid = round2(payload.payment.reduce((s, p) => s + p.price, 0));
    if (Math.abs(paid - total) > 0.01) {
      throw new GiMappingError(
        `סכום התשלומים (${paid.toFixed(2)}) אינו שווה לסכום החשבונית (${total.toFixed(2)}) — הפיקו חשבונית מס (305)`
      );
    }
  }
  return { payload, amountBeforeVat: subtotal, vatAmount: vat, amountTotal: total };
}

export function buildCreditNotePayload(input: {
  originalGreenInvoiceId: string;
  originalNumber?: string | null;
  delivery: CrmDeliveryForInvoice;
  lines: CrmDeliveryLine[];
  charges: CrmOrderCharge[];
  vatRate: number;
  customer: CrmCustomer;
  clientId: string | null;
  reason: string;
  today?: string;
}): BuiltDocument {
  const today = input.today ?? israelToday();
  const reason = input.reason.trim();
  if (!reason) throw new GiMappingError("יש לציין סיבה לזיכוי");
  const { rows, vatType } = buildIncomeRowsForDelivery(input.lines, input.charges, input.vatRate);
  const subtotal = incomeRowsTotal(rows);
  const vat = round2(subtotal * Number(input.vatRate));
  const payload: GiDocumentRequest = {
    type: 330,
    date: today,
    lang: "he",
    currency: "ILS",
    vatType: vatType === 2 ? 1 : 0,
    description: `זיכוי · תעודת משלוח ${input.delivery.delivery_number}`,
    remarks: input.originalNumber ? `ביטול חשבונית ${input.originalNumber}: ${reason}` : reason,
    client: clientRefForDocument(input.clientId, input.customer, null),
    income: rows,
    linkedDocumentIds: [input.originalGreenInvoiceId],
    linkType: "cancel",
    signed: true,
    attachment: false,
  };
  return { payload, amountBeforeVat: subtotal, vatAmount: vat, amountTotal: round2(subtotal + vat) };
}

// ---------------------------------------------------------------------------
// קבלה 400
// ---------------------------------------------------------------------------
export function buildReceiptPayload(input: {
  paymentNumber: number;
  payment: CrmPaymentLine;
  customer: CrmCustomer;
  clientId: string | null;
  linkedInvoiceIds: string[];
  deliveryNumbers: number[];
  emails: string[] | null;
  remarks?: string | null;
  today?: string;
}): BuiltDocument {
  const today = input.today ?? israelToday();
  const row = paymentLineToGi(input.payment, today);
  const linked = [...new Set(input.linkedInvoiceIds.filter(Boolean))];
  const payload: GiDocumentRequest = {
    type: 400,
    date: today,
    lang: "he",
    currency: "ILS",
    vatType: 0,
    description: `קבלה על תשלום ${input.paymentNumber}`,
    client: clientRefForDocument(input.clientId, input.customer, input.emails),
    // receipts carry no income rows; the field is required by the schema so we send [].
    income: [],
    payment: [row],
    signed: true,
    attachment: !!(input.emails && cleanEmails(input.emails).length),
  };
  if (linked.length) {
    payload.linkedDocumentIds = linked;
    payload.linkType = "link";
  }
  const remarkParts: string[] = [];
  if (input.deliveryNumbers.length) {
    remarkParts.push(`עבור תעודות משלוח: ${[...new Set(input.deliveryNumbers)].join(", ")}`);
  }
  if (input.remarks?.trim()) remarkParts.push(input.remarks.trim());
  if (remarkParts.length) payload.remarks = remarkParts.join("\n");
  return { payload, amountBeforeVat: row.price, vatAmount: 0, amountTotal: row.price };
}

// ---------------------------------------------------------------------------
// הוצאות
// ---------------------------------------------------------------------------
export type CrmExpenseForGi = {
  document_type: number;
  document_number: string | null;
  expense_date: string;
  reporting_month: string | null;
  amount_total: number;
  amount_before_vat: number | null;
  vat_amount: number | null;
  currency: string;
  is_paid: boolean;
  payment_method: CrmPaymentMethod | null;
  description: string | null;
  notes: string | null;
};

export type CrmSupplierForGi = {
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  green_invoice_supplier_id: string | null;
};

export function buildSupplierRequest(s: CrmSupplierForGi): GiSupplierRequest {
  const name = s.name.trim();
  if (!name) throw new GiMappingError("לספק אין שם");
  const req: GiSupplierRequest = { name, country: "IL" };
  if (normalizeTaxId(s.tax_id)) req.taxId = String(s.tax_id).replace(/\D/g, "");
  const emails = cleanEmails([s.email]);
  if (emails.length) req.emails = emails;
  if (s.phone?.trim()) req.phone = s.phone.trim();
  if (s.address?.trim()) req.address = s.address.trim();
  return req;
}

export function buildExpensePayload(input: {
  expense: CrmExpenseForGi;
  supplier: CrmSupplierForGi | null;
  classification: GiAccountingClassification | { id: string };
  /** תיאור ברירת מחדל (למשל שם הקטגוריה) */
  fallbackDescription?: string;
  today?: string;
}): GiExpenseRequest {
  const { expense: e } = input;
  const today = input.today ?? israelToday();
  if (!input.supplier) throw new GiMappingError("להוצאה לא משויך ספק — Green Invoice דורש פרטי ספק");
  const number = (e.document_number ?? "").trim();
  if (!number) throw new GiMappingError("חסר מספר מסמך (מספר החשבונית של הספק)");
  if (![20, 305, 320, 330, 400, 405].includes(Number(e.document_type))) {
    throw new GiMappingError("סוג מסמך ההוצאה אינו נתמך ב-Green Invoice");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.expense_date)) throw new GiMappingError("תאריך ההוצאה לא תקין");
  if (e.expense_date > today) throw new GiMappingError("תאריך ההוצאה עתידי");
  if (e.expense_date < "2010-01-01") throw new GiMappingError("תאריך ההוצאה מוקדם מדי");
  const total = round2(e.amount_total);
  if (!(total >= 0)) throw new GiMappingError("סכום ההוצאה לא תקין");
  let vat: number | undefined;
  if (e.vat_amount !== null && e.vat_amount !== undefined) vat = round2(e.vat_amount);
  else if (e.amount_before_vat !== null && e.amount_before_vat !== undefined) vat = round2(total - e.amount_before_vat);
  if (vat !== undefined && (vat < 0 || vat > total)) throw new GiMappingError("סכום המע״מ גדול מסכום ההוצאה");
  if (!input.classification?.id) throw new GiMappingError("יש לבחור סיווג הנהלת חשבונות");

  const s = input.supplier;
  const supplier = buildSupplierRequest(s);
  if (s.green_invoice_supplier_id) supplier.id = s.green_invoice_supplier_id;
  else supplier.add = true;

  const req: GiExpenseRequest = {
    documentType: Number(e.document_type),
    number,
    date: e.expense_date,
    reportingDate: e.reporting_month ? firstOfMonth(e.reporting_month) : firstOfMonth(e.expense_date),
    paymentType: e.is_paid && e.payment_method ? EXPENSE_PAYMENT_TYPE[e.payment_method] : -1,
    currency: e.currency || "ILS",
    amount: total,
    supplier,
    accountingClassification: input.classification,
    pcnClassification: "T",
    active: true,
  };
  if (vat !== undefined) req.vat = vat;
  const desc = e.description?.trim() || input.fallbackDescription?.trim();
  if (desc) req.description = desc;
  if (e.notes?.trim()) req.remarks = e.notes.trim();
  return req;
}

/**
 * GET /accounting/classifications/map — מבנה התשובה לא מתועד ב-spec.
 * אוספים כל אובייקט עם id + title (מערך, אובייקט של מערכים, או קינון) בלי כפילויות.
 */
export function normalizeClassifications(raw: unknown): GiAccountingClassification[] {
  const out = new Map<string, GiAccountingClassification>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    if (typeof o.id === "string" && typeof o.title === "string") {
      if (!out.has(o.id)) {
        const c: GiAccountingClassification = { id: o.id, title: o.title };
        if (typeof o.key === "string") c.key = o.key;
        if (typeof o.code === "string") c.code = o.code;
        if (typeof o.irsCode === "number") c.irsCode = o.irsCode;
        if (typeof o.type === "number") c.type = o.type;
        if (typeof o.income === "number") c.income = o.income;
        if (typeof o.vat === "number") c.vat = o.vat;
        if (typeof o.mixed === "number") c.mixed = o.mixed;
        out.set(o.id, c);
      }
    }
    for (const [k, x] of Object.entries(o)) {
      if (k !== "id" && x && typeof x === "object") visit(x, depth + 1);
    }
  };
  visit(raw, 0);
  return [...out.values()].sort((a, b) => (a.code ?? a.key ?? "").localeCompare(b.code ?? b.key ?? "") || a.title.localeCompare(b.title, "he"));
}
