/**
 * בונה ומאמת בקשת POST /documents (וגם /documents/preview) של Morning מתוך מודל הטופס,
 * לפי ההגדרות ב-document-types.ts. טהור — בלי רשת ובלי DB (נבדק ב-__tests__/document-builder.test.mjs).
 *
 * חישוב סכומים (כמו Morning):
 * - שורה: סכום = כמות × מחיר. vatType 0 = לפני מע״מ (מע״מ מתווסף), 1 = כולל מע״מ, 2 = פטור.
 * - vatType של המסמך 1 (פטור) → אין מע״מ בכלל; 0 (רגיל) → אסור שורות פטורות (צריך 2 = מעורב) [inferred].
 * - הנחה (discount) "excluded from VAT" לפי ה-spec → מופחתת מהסכום לפני מע״מ, והמע״מ מחושב אחריה [inferred].
 * - עיגול (rounding) → הסה״כ מעוגל לשקל שלם [inferred].
 * - קבלות (400/405/410/600/610): הסה״כ = סכום התקבולים.
 */

import {
  GI_CURRENCY_CODES,
  GI_DEFAULT_VAT_RATE,
  GI_DOC_TYPE_DEFS,
  GI_LIMITS,
  GI_PAYMENT_TYPES,
  isGiDocType,
  type GiDiscountType,
  type GiDocType,
  type GiDocTypeDef,
  type GiDocVatType,
  type GiLang,
  type GiLinkType,
  type GiPaymentType,
  type GiRowVatType,
} from "./document-types";

// =============================================================================
// מודל הטופס (ערכים מספריים יכולים להגיע כמחרוזת מהשדות)
// =============================================================================
export type Num = number | string | null | undefined;

export type DocIncomeRowModel = {
  description: string;
  quantity: Num;
  price: Num;
  vatType: GiRowVatType;
  /** ריק = ברירת המחדל של העסק */
  vatRate?: Num;
  catalogNum?: string;
  itemId?: string;
  /** ריק = מטבע המסמך */
  currency?: string;
  currencyRate?: Num;
};

export type DocPaymentRowModel = {
  type: GiPaymentType;
  date: string;
  price: Num;
  currency?: string;
  currencyRate?: Num;
  chequeNum?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccount?: string;
  cardType?: Num;
  cardNum?: string;
  dealType?: Num;
  numPayments?: Num;
  firstPayment?: Num;
  accountId?: string;
  transactionId?: string;
  appType?: Num;
  subType?: Num;
};

export type DocClientModel = {
  /** מזהה לקוח ב-Morning (כשידוע). כשיש — שולחים id (+ מיילים) */
  id?: string | null;
  name: string;
  taxId?: string;
  emails?: string[];
  address?: string;
  city?: string;
  zip?: string;
  country?: string;
  phone?: string;
  fax?: string;
  mobile?: string;
  /** להוסיף לרשימת הלקוחות ב-Morning (רק כשאין id) */
  add?: boolean;
  /** חשבונית עצמית (305 בלבד) */
  self?: boolean;
};

export type DocFormModel = {
  type: GiDocType;
  date?: string;
  dueDate?: string;
  lang: GiLang;
  currency: string;
  /** שער המרה של המסמך (מועתק לשורות שאין להן שער) */
  currencyRate?: Num;
  vatType: GiDocVatType;
  discount?: { amount: Num; type: GiDiscountType } | null;
  rounding?: boolean;
  signed?: boolean;
  attachment?: boolean;
  description?: string;
  remarks?: string;
  footer?: string;
  emailContent?: string;
  client: DocClientModel;
  income: DocIncomeRowModel[];
  payment: DocPaymentRowModel[];
  linkedDocumentIds?: string[];
  linkType?: GiLinkType | "" | null;
  linkedPaymentId?: string;
  paymentRequest?: {
    enabled: boolean;
    plugins: { id: string; group?: number; type?: number }[];
    maxPayments?: Num;
  } | null;
};

// =============================================================================
// בקשת Morning (spec: CreateDocumentRequest)
// =============================================================================
export type GiIncomeRowPayload = {
  description: string;
  quantity: number;
  price: number;
  currency: string;
  vatType: GiRowVatType;
  currencyRate?: number;
  vatRate?: number;
  catalogNum?: string;
  itemId?: string;
};

export type GiPaymentRowPayload = {
  date: string;
  type: GiPaymentType;
  price: number;
  currency: string;
  currencyRate?: number;
  chequeNum?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccount?: string;
  cardType?: number;
  cardNum?: string;
  dealType?: number;
  numPayments?: number;
  firstPayment?: number;
  accountId?: string;
  transactionId?: string;
  appType?: number;
  subType?: number;
};

export type GiClientPayload = {
  id?: string;
  name?: string;
  taxId?: string;
  emails?: string[];
  address?: string;
  city?: string;
  zip?: string;
  country?: string;
  phone?: string;
  fax?: string;
  mobile?: string;
  add?: boolean;
  self?: boolean;
};

export type GiDocumentPayload = {
  type: GiDocType;
  date?: string;
  dueDate?: string;
  lang: GiLang;
  currency: string;
  vatType: GiDocVatType;
  discount?: { amount: number; type: GiDiscountType };
  rounding?: boolean;
  signed?: boolean;
  attachment?: boolean;
  description?: string;
  remarks?: string;
  footer?: string;
  emailContent?: string;
  client: GiClientPayload;
  income: GiIncomeRowPayload[];
  payment?: GiPaymentRowPayload[];
  linkedDocumentIds?: string[];
  linkType?: GiLinkType;
  linkedPaymentId?: string;
  paymentRequestData?: {
    plugins: { id: string; group?: number; type?: number }[];
    maxPayments?: number;
  };
};

// =============================================================================
// עזרים
// =============================================================================
export type DocIssue = { path: string; message: string };

export function r2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** "1,234.5" / " 12 " / 3 → מספר; ריק / לא תקין → null */
export function toNum(v: Num): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/,/g, "").replace(/\s/g, "").replace(/[^\d.\-]/g, "");
  if (!s || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidDate(s: string | null | undefined): s is string {
  if (!s || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** תאריך היום בישראל YYYY-MM-DD */
export function israelTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now);
}

const clean = (s: string | null | undefined) => (s ?? "").trim();

export function cleanEmailList(list: (string | null | undefined)[] | null | undefined): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of list ?? []) {
    for (const part of String(raw ?? "").split(/[,;\s]+/)) {
      const e = part.trim().toLowerCase();
      if (!e) continue;
      if (!EMAIL_RE.test(e)) invalid.push(part.trim());
      else if (!valid.includes(e)) valid.push(e);
    }
  }
  return { valid, invalid };
}

export function docDef(type: GiDocType): GiDocTypeDef {
  return GI_DOC_TYPE_DEFS[type];
}

/** האם השדה מוצג / נשלח לסוג הזה */
export function fieldApplies(type: GiDocType, field: keyof GiDocTypeDef["fields"]): boolean {
  return GI_DOC_TYPE_DEFS[type].fields[field] !== "forbidden";
}

export function takesIncome(type: GiDocType): boolean {
  return GI_DOC_TYPE_DEFS[type].income !== "forbidden";
}

export function takesPayments(type: GiDocType): boolean {
  return GI_DOC_TYPE_DEFS[type].payment !== "forbidden";
}

// =============================================================================
// סכומים
// =============================================================================
export type DocTotals = {
  /** סכום השורות לפני מע״מ ולפני הנחה (חייב + פטור) */
  linesBeforeVat: number;
  /** סכום ההנחה (חיובי = הופחת) */
  discount: number;
  /** סכום חייב במע״מ אחרי הנחה */
  taxable: number;
  /** סכום פטור אחרי הנחה */
  exempt: number;
  /** לפני מע״מ אחרי הנחה (taxable + exempt) */
  beforeVat: number;
  vat: number;
  /** הפרש עיגול */
  rounding: number;
  /** סה״כ המסמך (במטבע המסמך) */
  total: number;
  /** סכום התקבולים */
  payments: number;
  /** total − payments (במסמכים עם תקבולים) */
  balance: number;
  /** הסכום שמשמש כסה״כ המסמך: הכנסות, או תקבולים במסמך בלי הכנסות */
  documentAmount: number;
};

export function rowLineTotal(row: Pick<DocIncomeRowModel, "quantity" | "price">): number {
  const q = toNum(row.quantity) ?? 0;
  const p = toNum(row.price) ?? 0;
  return r2(q * p);
}

export function computeTotals(model: DocFormModel, defaultVatRate: number = GI_DEFAULT_VAT_RATE): DocTotals {
  const def = GI_DOC_TYPE_DEFS[model.type];
  const income = def.income === "forbidden" ? [] : model.income;
  const docExempt = model.vatType === 1;
  let taxableNet = 0;
  let exemptNet = 0;
  let vat = 0;
  for (const row of income) {
    const line = rowLineTotal(row);
    const rate = toNum(row.vatRate ?? null) ?? defaultVatRate;
    if (docExempt || row.vatType === 2) {
      exemptNet += line;
    } else if (row.vatType === 1) {
      const net = line / (1 + rate);
      taxableNet += net;
      vat += line - net;
    } else {
      taxableNet += line;
      vat += line * rate;
    }
  }
  const linesBeforeVat = r2(taxableNet + exemptNet);

  // הנחה: מופחתת מהסכום לפני מע״מ באופן יחסי (חייב / פטור), והמע״מ קטן באותו יחס
  let factor = 1;
  let discount = 0;
  if (def.fields.discount !== "forbidden" && model.discount) {
    const amount = toNum(model.discount.amount) ?? 0;
    const base = taxableNet + exemptNet;
    if (amount > 0 && base > 0) {
      if (model.discount.type === "percentage") factor = Math.max(0, 1 - amount / 100);
      else factor = Math.max(0, (base - amount) / base);
      discount = r2(base * (1 - factor));
    }
  }
  const taxable = r2(taxableNet * factor);
  const exempt = r2(exemptNet * factor);
  const vatAmount = r2(vat * factor);
  let total = r2(taxable + exempt + vatAmount);
  let rounding = 0;
  if (def.fields.rounding !== "forbidden" && model.rounding) {
    const rounded = Math.round(total);
    rounding = r2(rounded - total);
    total = rounded;
  }
  const payments = def.payment === "forbidden" ? 0 : r2(model.payment.reduce((s, p) => s + (toNum(p.price) ?? 0), 0));
  const hasIncome = income.length > 0;
  const documentAmount = hasIncome ? total : payments;
  return {
    linesBeforeVat,
    discount,
    taxable,
    exempt,
    beforeVat: r2(taxable + exempt),
    vat: vatAmount,
    rounding,
    total,
    payments,
    balance: r2(documentAmount - payments),
    documentAmount,
  };
}

/**
 * "מלא לפי הסה״כ": משלים את שורות התקבול לסכום המסמך.
 * בלי שורות — מוסיף שורה אחת (ברירת מחדל: העברה בנקאית, היום); אחרת מעדכן את השורה האחרונה.
 */
export function fillPaymentsToTotal(
  model: DocFormModel,
  opts: { today?: string; defaultType?: GiPaymentType; vatRate?: number } = {}
): DocPaymentRowModel[] {
  const totals = computeTotals({ ...model, payment: [] }, opts.vatRate);
  const target = totals.total;
  const today = opts.today ?? israelTodayIso();
  if (!model.payment.length) {
    return [{ type: opts.defaultType ?? 4, date: today, price: target }];
  }
  const rows = model.payment.map((p) => ({ ...p }));
  const others = r2(rows.slice(0, -1).reduce((s, p) => s + (toNum(p.price) ?? 0), 0));
  rows[rows.length - 1].price = r2(target - others);
  return rows;
}

// =============================================================================
// ולידציה
// =============================================================================
export type ValidateOptions = {
  today?: string;
  /** שיעור מע״מ ברירת מחדל (DocumentInfo.vatRate) */
  vatRate?: number;
  /** תאריך המסמך האחרון מאותו סוג (DocumentInfo.lastDocumentDate) — 2405 */
  lastDocumentDate?: string | null;
  /** תפקיד המשתמש: agent לא מפיק סוגים של מנהל בלבד */
  role?: "admin" | "agent";
  /** בתצוגה מקדימה אין צורך במזהה לקוח / בכלל ההרשאות */
  forPreview?: boolean;
};

export function validateDocumentModel(model: DocFormModel, opts: ValidateOptions = {}): DocIssue[] {
  const issues: DocIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  if (!isGiDocType(model.type)) {
    add("type", "סוג מסמך לא נתמך");
    return issues;
  }
  const def = GI_DOC_TYPE_DEFS[model.type];
  const today = opts.today ?? israelTodayIso();
  const rate = opts.vatRate ?? GI_DEFAULT_VAT_RATE;

  if (opts.role === "agent" && def.adminOnly && !opts.forPreview) {
    add("type", `הפקת ${def.name} מותרת למנהל בלבד`);
  }

  // ---- שדות המסמך ----
  if (model.lang !== "he" && model.lang !== "en") add("lang", "יש לבחור שפה (עברית / אנגלית)");
  if (!GI_CURRENCY_CODES.includes(model.currency)) add("currency", "מטבע לא נתמך");
  if (![0, 1, 2].includes(model.vatType)) add("vatType", "סוג מע״מ לא תקין");
  const docRate = toNum(model.currencyRate ?? null);
  if (model.currency !== "ILS" && model.currencyRate !== undefined && model.currencyRate !== "" && (docRate === null || docRate <= 0)) {
    add("currencyRate", "שער ההמרה חייב להיות גדול מאפס");
  }

  if (model.date) {
    if (!isValidDate(model.date)) add("date", "תאריך המסמך לא תקין");
    else {
      if (!def.futureDateAllowed && model.date > today) add("date", `לא ניתן להפיק ${def.name} בתאריך עתידי`);
      if (def.taxDocument && opts.lastDocumentDate && isValidDate(opts.lastDocumentDate) && model.date < opts.lastDocumentDate) {
        add("date", `התאריך מוקדם מהמסמך האחרון מסוג זה (${opts.lastDocumentDate})`);
      }
    }
  }
  if (model.dueDate && def.fields.dueDate !== "forbidden") {
    if (!isValidDate(model.dueDate)) add("dueDate", "תאריך לתשלום לא תקין");
    else if (model.date && isValidDate(model.date) && model.dueDate < model.date) {
      add("dueDate", "תאריך התשלום לפני תאריך המסמך");
    }
  }
  if (model.footer && model.footer.length > GI_LIMITS.maxFooterLength) add("footer", "הטקסט התחתון ארוך מ-2000 תווים");

  // ---- לקוח ----
  const c = model.client;
  const who = def.counterparty === "supplier" ? "הספק" : "הלקוח";
  if (!c || (!clean(c.id) && !clean(c.name))) add("client.name", `יש למלא את שם ${who}`);
  const emails = cleanEmailList(c?.emails);
  if (emails.invalid.length) add("client.emails", `כתובת מייל לא תקינה: ${emails.invalid.join(", ")}`);
  if (emails.valid.length > GI_LIMITS.maxClientEmails) add("client.emails", `ניתן לשלוח לעד ${GI_LIMITS.maxClientEmails} כתובות מייל`);
  if (c?.self && def.fields.clientSelf === "forbidden") add("client.self", "חשבונית עצמית אפשרית רק בחשבונית מס (305)");
  if (c?.country && !/^[A-Z]{2}$/.test(c.country)) add("client.country", "קוד מדינה לא תקין (2 אותיות, למשל IL)");
  if (model.signed === false && emails.valid.length) add("signed", "לא ניתן לשלוח במייל מסמך שלא נחתם דיגיטלית");

  // ---- שורות הכנסה ----
  const income = def.income === "forbidden" ? [] : model.income;
  if (def.income === "forbidden" && model.income.some((r) => clean(r.description) || toNum(r.price))) {
    add("income", `ל${def.name} אין שורות הכנסה`);
  }
  if (def.income === "required" && income.length === 0) add("income", "יש להזין לפחות שורת הכנסה אחת");
  if (income.length > GI_LIMITS.maxRows) add("income", "עד 200 שורות הכנסה במסמך");
  income.forEach((row, i) => {
    const p = `income.${i}`;
    const n = i + 1;
    if (!clean(row.description)) add(`${p}.description`, `שורה ${n}: חסר תיאור`);
    const q = toNum(row.quantity);
    if (q === null) add(`${p}.quantity`, `שורה ${n}: חסרה כמות`);
    else if (q <= 0) add(`${p}.quantity`, `שורה ${n}: הכמות חייבת להיות גדולה מאפס`);
    const pr = toNum(row.price);
    if (pr === null) add(`${p}.price`, `שורה ${n}: חסר מחיר`);
    if (![0, 1, 2].includes(row.vatType)) add(`${p}.vatType`, `שורה ${n}: סוג מע״מ לא תקין`);
    const vr = toNum(row.vatRate ?? null);
    if (row.vatRate !== undefined && row.vatRate !== null && row.vatRate !== "" && (vr === null || vr < 0 || vr > 1)) {
      add(`${p}.vatRate`, `שורה ${n}: שיעור מע״מ חייב להיות בין 0 ל-1 (למשל 0.18)`);
    }
    if (row.currency && !GI_CURRENCY_CODES.includes(row.currency)) add(`${p}.currency`, `שורה ${n}: מטבע לא נתמך`);
    const cr = toNum(row.currencyRate ?? null);
    if (row.currencyRate !== undefined && row.currencyRate !== null && row.currencyRate !== "" && (cr === null || cr <= 0)) {
      add(`${p}.currencyRate`, `שורה ${n}: שער ההמרה חייב להיות גדול מאפס`);
    }
    // מסמך פטור (vatType 1): כל השורות נשלחות כפטורות (2) — אין צורך לבדוק
    if (model.vatType === 0 && row.vatType === 2) {
      add(`${p}.vatType`, `שורה ${n}: שורה פטורה ממע״מ דורשת סוג מע״מ "מעורב" למסמך`);
    }
  });

  // ---- הנחה ----
  if (model.discount && def.fields.discount !== "forbidden") {
    const a = toNum(model.discount.amount);
    if (a !== null && a !== 0) {
      if (a < 0) add("discount.amount", "ההנחה חייבת להיות חיובית");
      if (model.discount.type !== "sum" && model.discount.type !== "percentage") add("discount.type", "סוג הנחה לא תקין");
      if (model.discount.type === "percentage" && a > 100) add("discount.amount", "אחוז ההנחה לא יכול לעלות על 100");
    }
  }

  // ---- תקבולים ----
  const payments = def.payment === "forbidden" ? [] : model.payment;
  if (def.payment === "forbidden" && model.payment.length) add("payment", `ל${def.name} אין שורות תקבול`);
  if (def.payment === "required" && payments.length === 0) add("payment", "יש להזין לפחות שורת תקבול אחת");
  if (payments.length > GI_LIMITS.maxRows) add("payment", "עד 200 שורות תקבול במסמך");
  if (payments.length && payments.every((p) => p.type === 0)) {
    add("payment", "יש להזין לפחות שורת תקבול אחת בנוסף לניכוי במקור");
  }
  payments.forEach((row, i) => {
    const p = `payment.${i}`;
    const n = i + 1;
    if (!(GI_PAYMENT_TYPES as readonly number[]).includes(row.type)) add(`${p}.type`, `תקבול ${n}: אמצעי תשלום לא תקין`);
    if (!isValidDate(row.date)) add(`${p}.date`, `תקבול ${n}: חסר תאריך תשלום`);
    else if (row.date > today) add(`${p}.date`, `תקבול ${n}: תאריך התשלום עתידי`);
    const pr = toNum(row.price);
    if (pr === null) add(`${p}.price`, `תקבול ${n}: חסר סכום`);
    else if (pr === 0) add(`${p}.price`, `תקבול ${n}: הסכום חייב להיות שונה מאפס`);
    if (row.currency && !GI_CURRENCY_CODES.includes(row.currency)) add(`${p}.currency`, `תקבול ${n}: מטבע לא נתמך`);
    if (row.type === 2) {
      if (!clean(row.chequeNum)) add(`${p}.chequeNum`, `תקבול ${n} (צ׳ק): חסר מספר צ׳ק`);
      if (!clean(row.bankName)) add(`${p}.bankName`, `תקבול ${n} (צ׳ק): חסר בנק`);
      if (!clean(row.bankBranch)) add(`${p}.bankBranch`, `תקבול ${n} (צ׳ק): חסר סניף`);
      else if (clean(row.bankBranch).length > 5) add(`${p}.bankBranch`, `תקבול ${n} (צ׳ק): מספר סניף עד 5 תווים`);
      if (!clean(row.bankAccount)) add(`${p}.bankAccount`, `תקבול ${n} (צ׳ק): חסר מספר חשבון`);
    }
    if (row.type === 3) {
      const np = toNum(row.numPayments ?? null);
      if (np !== null && (!Number.isInteger(np) || np < GI_LIMITS.minNumPayments || np > GI_LIMITS.maxNumPayments)) {
        add(`${p}.numPayments`, `תקבול ${n}: מספר תשלומים 1–36`);
      }
      if (clean(row.cardNum) && !/^\d{4}$/.test(clean(row.cardNum))) add(`${p}.cardNum`, `תקבול ${n}: יש להזין 4 ספרות אחרונות של הכרטיס`);
      const ct = toNum(row.cardType ?? null);
      if (ct !== null && ![0, 1, 2, 3, 4, 5].includes(ct)) add(`${p}.cardType`, `תקבול ${n}: סוג כרטיס לא תקין`);
      const dt = toNum(row.dealType ?? null);
      if (dt !== null && ![1, 2, 3, 4, 5, 6].includes(dt)) add(`${p}.dealType`, `תקבול ${n}: סוג עסקה לא תקין`);
    }
    if (row.type === 10) {
      const at = toNum(row.appType ?? null);
      if (at !== null && ![1, 2, 3, 5, 6].includes(at)) add(`${p}.appType`, `תקבול ${n}: אפליקציה לא תקינה`);
    }
    if (row.type === 11) {
      const st = toNum(row.subType ?? null);
      if (st === null) add(`${p}.subType`, `תקבול ${n} (אחר): יש לבחור את סוג התשלום`);
      else if (![1, 2, 3, 4, 5, 6, 7, 9].includes(st)) add(`${p}.subType`, `תקבול ${n}: סוג תשלום "אחר" לא תקין`);
    }
  });

  // ---- סכומים ----
  const t = computeTotals(model, rate);
  if (income.length) {
    if (def.totalSign === "positive" && !(t.total > 0)) add("total", "סכום המסמך חייב להיות גדול מאפס");
    if (def.totalSign === "nonnegative" && t.total < 0) add("total", "סכום המסמך לא יכול להיות שלילי");
    if (def.totalSign === "nonzero" && t.total === 0) add("total", "סכום המסמך חייב להיות שונה מאפס");
  } else if (payments.length && def.totalSign === "positive" && !(t.payments > 0)) {
    add("total", "סכום התקבולים חייב להיות גדול מאפס");
  }
  const mustEqual =
    def.paymentsMustEqualTotal === "always" || (def.paymentsMustEqualTotal === "whenIncome" && income.length > 0);
  if (mustEqual && payments.length && Math.abs(t.payments - t.total) > 0.009) {
    add("payment", `סכום התקבולים (${t.payments.toFixed(2)}) אינו שווה לסכום המסמך (${t.total.toFixed(2)})`);
  }

  // ---- קישורים ----
  const linked = (model.linkedDocumentIds ?? []).filter((x) => clean(x));
  if (model.linkType && !linked.length) add("linkType", "סוג קישור נבחר בלי מסמך מקושר");
  if (model.linkType && !def.linkTypes.includes(model.linkType)) {
    add("linkType", `סוג הקישור אינו מתאים ל${def.name}`);
  }
  if (linked.length && new Set(linked).size !== linked.length) add("linkedDocumentIds", "מסמך מקושר מופיע פעמיים");
  if (clean(model.linkedPaymentId) && def.fields.linkedPaymentId === "forbidden") {
    add("linkedPaymentId", "מזהה תשלום מקושר אפשרי רק בחשבונית מס (305)");
  }

  // ---- בקשת תשלום מקוון ----
  if (model.paymentRequest?.enabled) {
    if (def.fields.paymentRequestData === "forbidden") add("paymentRequest", `ל${def.name} אין בקשת תשלום מקוון`);
    else if (!model.paymentRequest.plugins.length) add("paymentRequest", "יש לבחור לפחות ערוץ תשלום מקוון אחד");
    const mp = toNum(model.paymentRequest.maxPayments ?? null);
    if (mp !== null && (!Number.isInteger(mp) || mp < 1 || mp > 36)) add("paymentRequest.maxPayments", "מספר תשלומים מרבי 1–36");
  }
  return issues;
}

// =============================================================================
// בניית הבקשה
// =============================================================================
export type BuildResult =
  | { ok: true; payload: GiDocumentPayload; totals: DocTotals; issues: [] }
  | { ok: false; issues: DocIssue[]; totals: DocTotals };

function setStr<T extends object>(obj: T, key: keyof T, v: string | null | undefined) {
  const s = clean(v);
  if (s) (obj as Record<string, unknown>)[key as string] = s;
}

function setNum<T extends object>(obj: T, key: keyof T, v: Num) {
  const n = toNum(v);
  if (n !== null) (obj as Record<string, unknown>)[key as string] = n;
}

export function buildClientPayload(c: DocClientModel, type: GiDocType): GiClientPayload {
  const def = GI_DOC_TYPE_DEFS[type];
  const out: GiClientPayload = {};
  const emails = cleanEmailList(c.emails).valid.slice(0, GI_LIMITS.maxClientEmails);
  if (clean(c.id)) {
    out.id = clean(c.id);
    if (emails.length) out.emails = emails;
  } else {
    setStr(out, "name", c.name);
    setStr(out, "taxId", c.taxId);
    if (emails.length) out.emails = emails;
    setStr(out, "address", c.address);
    setStr(out, "city", c.city);
    setStr(out, "zip", c.zip);
    out.country = clean(c.country) || "IL";
    setStr(out, "phone", c.phone);
    setStr(out, "fax", c.fax);
    setStr(out, "mobile", c.mobile);
    if (c.add) out.add = true;
  }
  if (c.self && def.fields.clientSelf !== "forbidden") out.self = true;
  return out;
}

export function buildIncomePayload(model: DocFormModel): GiIncomeRowPayload[] {
  const def = GI_DOC_TYPE_DEFS[model.type];
  if (def.income === "forbidden") return [];
  const docRate = model.currency !== "ILS" ? toNum(model.currencyRate ?? null) : null;
  return model.income.map((row) => {
    const out: GiIncomeRowPayload = {
      description: clean(row.description),
      quantity: toNum(row.quantity) ?? 0,
      price: toNum(row.price) ?? 0,
      currency: clean(row.currency) || model.currency,
      vatType: model.vatType === 1 ? 2 : row.vatType,
    };
    const rate = toNum(row.currencyRate ?? null) ?? docRate;
    if (rate !== null && rate !== 1) out.currencyRate = rate;
    setNum(out, "vatRate", row.vatRate);
    setStr(out, "catalogNum", row.catalogNum);
    setStr(out, "itemId", row.itemId);
    return out;
  });
}

const PAYMENT_FIELDS_BY_TYPE: Record<GiPaymentType, (keyof DocPaymentRowModel)[]> = {
  0: [],
  1: [],
  2: ["chequeNum", "bankName", "bankBranch", "bankAccount"],
  3: ["cardType", "cardNum", "dealType", "numPayments", "firstPayment"],
  4: ["bankName", "bankBranch", "bankAccount"],
  5: ["accountId", "transactionId"],
  10: ["appType", "accountId", "transactionId"],
  11: ["subType", "accountId", "transactionId"],
};

const NUMERIC_PAYMENT_FIELDS = new Set<keyof DocPaymentRowModel>([
  "cardType",
  "dealType",
  "numPayments",
  "firstPayment",
  "appType",
  "subType",
]);

export function buildPaymentPayload(model: DocFormModel): GiPaymentRowPayload[] {
  const def = GI_DOC_TYPE_DEFS[model.type];
  if (def.payment === "forbidden") return [];
  const docRate = model.currency !== "ILS" ? toNum(model.currencyRate ?? null) : null;
  return model.payment.map((row) => {
    const out: GiPaymentRowPayload = {
      date: row.date,
      type: row.type,
      price: r2(toNum(row.price) ?? 0),
      currency: clean(row.currency) || model.currency,
    };
    const rate = toNum(row.currencyRate ?? null) ?? docRate;
    if (rate !== null && rate !== 1) out.currencyRate = rate;
    for (const k of PAYMENT_FIELDS_BY_TYPE[row.type] ?? []) {
      const v = row[k];
      if (NUMERIC_PAYMENT_FIELDS.has(k)) setNum(out, k as keyof GiPaymentRowPayload, v as Num);
      else setStr(out, k as keyof GiPaymentRowPayload, v as string);
    }
    return out;
  });
}

/** בונה את גוף הבקשה (רק שדות שחלים על הסוג). מחזיר שגיאות בעברית כשהמודל לא תקין. */
export function buildDocumentPayload(model: DocFormModel, opts: ValidateOptions = {}): BuildResult {
  const totals = computeTotals(model, opts.vatRate);
  const issues = validateDocumentModel(model, opts);
  if (issues.length) return { ok: false, issues, totals };
  const def = GI_DOC_TYPE_DEFS[model.type];
  const f = def.fields;
  const payload: GiDocumentPayload = {
    type: model.type,
    lang: model.lang,
    currency: model.currency,
    vatType: model.vatType,
    client: buildClientPayload(model.client, model.type),
    income: buildIncomePayload(model),
  };
  if (model.date) payload.date = model.date;
  if (f.dueDate !== "forbidden" && model.dueDate) payload.dueDate = model.dueDate;
  if (f.discount !== "forbidden" && model.discount) {
    const a = toNum(model.discount.amount);
    if (a !== null && a > 0) payload.discount = { amount: a, type: model.discount.type };
  }
  if (f.rounding !== "forbidden" && model.rounding) payload.rounding = true;
  payload.signed = model.signed !== false;
  const hasEmails = !!payload.client.emails?.length;
  payload.attachment = !!model.attachment && hasEmails;
  setStr(payload, "description", model.description);
  setStr(payload, "remarks", model.remarks);
  setStr(payload, "footer", model.footer);
  if (hasEmails) setStr(payload, "emailContent", model.emailContent);
  if (def.payment !== "forbidden") payload.payment = buildPaymentPayload(model);
  const linked = [...new Set((model.linkedDocumentIds ?? []).map(clean).filter(Boolean))];
  if (linked.length) {
    payload.linkedDocumentIds = linked;
    payload.linkType = (model.linkType || def.defaultLinkType) as GiLinkType;
  }
  if (f.linkedPaymentId !== "forbidden") setStr(payload, "linkedPaymentId", model.linkedPaymentId);
  if (f.paymentRequestData !== "forbidden" && model.paymentRequest?.enabled) {
    payload.paymentRequestData = { plugins: model.paymentRequest.plugins.map((p) => ({ ...p })) };
    const mp = toNum(model.paymentRequest.maxPayments ?? null);
    if (mp !== null) payload.paymentRequestData.maxPayments = mp;
  }
  return { ok: true, payload, totals, issues: [] };
}

/** מודל ריק לסוג נתון (ברירות מחדל של הטופס) */
export function emptyDocumentModel(type: GiDocType, today: string = israelTodayIso()): DocFormModel {
  const def = GI_DOC_TYPE_DEFS[type];
  return {
    type,
    date: today,
    dueDate: "",
    lang: "he",
    currency: "ILS",
    currencyRate: "",
    vatType: 0,
    discount: null,
    rounding: false,
    signed: true,
    attachment: true,
    description: "",
    remarks: "",
    footer: "",
    emailContent: "",
    client: { id: null, name: "", emails: [], country: "IL", add: false, self: false },
    income: def.income === "required" ? [{ description: "", quantity: 1, price: "", vatType: 0 }] : [],
    payment: def.payment === "required" ? [{ type: 4, date: today, price: "" }] : [],
    linkedDocumentIds: [],
    linkType: "",
    linkedPaymentId: "",
    paymentRequest: null,
  };
}

/**
 * מתאים מודל קיים לסוג חדש (כשמחליפים סוג בטופס): מנקה שדות שלא חלים,
 * ומוסיף שורה ריקה כשהסוג החדש דורש שורות.
 */
export function adaptModelToType(model: DocFormModel, type: GiDocType, today: string = israelTodayIso()): DocFormModel {
  const def = GI_DOC_TYPE_DEFS[type];
  const next: DocFormModel = { ...model, type };
  if (def.fields.dueDate === "forbidden") next.dueDate = "";
  if (def.fields.discount === "forbidden") next.discount = null;
  if (def.fields.rounding === "forbidden") next.rounding = false;
  if (def.fields.clientSelf === "forbidden") next.client = { ...next.client, self: false };
  if (def.fields.linkedPaymentId === "forbidden") next.linkedPaymentId = "";
  if (def.fields.paymentRequestData === "forbidden") next.paymentRequest = null;
  if (def.income === "forbidden") next.income = [];
  else if (def.income === "required" && !next.income.length) next.income = [{ description: "", quantity: 1, price: "", vatType: 0 }];
  if (def.payment === "forbidden") next.payment = [];
  else if (def.payment === "required" && !next.payment.length) next.payment = [{ type: 4, date: today, price: "" }];
  if (next.linkType && !def.linkTypes.includes(next.linkType)) next.linkType = def.defaultLinkType;
  return next;
}

/** הודעה ראשונה לכל נתיב (לתצוגה ליד השדה) */
export function issuesByPath(issues: DocIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) if (!(i.path in out)) out[i.path] = i.message;
  return out;
}
