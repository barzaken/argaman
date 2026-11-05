/**
 * הגדרות כל סוגי המסמכים של Morning (Green Invoice) — מה כל סוג מקבל ב-POST /documents.
 *
 * מקור: ה-OpenAPI הרשמי (developers.morning.co/docs/openapi.bundled.json, נבדק 2026-11-05).
 * ה-spec מגדיר סכמת בקשה אחת (CreateDocumentRequest) לכל הסוגים ולא מפרט אילו שדות חלים על איזה סוג.
 * לכן כל כלל מסומן במקור שלו:
 *   - "spec"     — כתוב במפורש ב-spec (תיאור שדה, enum, טבלת שגיאות, required).
 *   - "inferred" — הסקה מהתנהגות Morning / הנהלת חשבונות בישראל. לא מופיע ב-spec.
 * בזמן ריצה GET /documents/info?type=X מחזיר incomeRowsEnabled / incomeRowsRequired /
 * paymentRowsEnabled / vatTypes / selfInvoiceEnabled לעסק הספציפי — הטופס מציג אזהרה כשיש סתירה.
 *
 * הקובץ טהור (בלי server-only ובלי ייבוא) — משמש את השרת, את הטופס ואת הבדיקות ב-node.
 */

// =============================================================================
// קודים (spec: components.schemas.*)
// =============================================================================

/** spec: DocumentType */
export const GI_DOC_TYPES = [10, 20, 100, 200, 210, 300, 305, 320, 330, 400, 405, 410, 500, 600, 610] as const;
export type GiDocType = (typeof GI_DOC_TYPES)[number];

export function isGiDocType(v: unknown): v is GiDocType {
  return typeof v === "number" && (GI_DOC_TYPES as readonly number[]).includes(v);
}

/** spec: Lang */
export const GI_LANGS = ["he", "en"] as const;
export type GiLang = (typeof GI_LANGS)[number];
export const GI_LANG_LABELS: Record<GiLang, string> = { he: "עברית", en: "אנגלית" };

/** spec: Currency (טבלה עם שמות בעברית) */
export const GI_CURRENCIES: { code: string; label: string }[] = [
  { code: "ILS", label: "שקל" },
  { code: "USD", label: "דולר" },
  { code: "EUR", label: "אירו" },
  { code: "GBP", label: "ליש״ט" },
  { code: "JPY", label: "יין יפני" },
  { code: "CHF", label: "פרנק שוויצרי" },
  { code: "CNY", label: "יואן סיני" },
  { code: "AUD", label: "דולר אוסטרלי" },
  { code: "CAD", label: "דולר קנדי" },
  { code: "RUB", label: "רובל" },
  { code: "BRL", label: "ריאל ברזילאי" },
  { code: "HKD", label: "דולר הונג קונגי" },
  { code: "SGD", label: "דולר סינגפורי" },
  { code: "THB", label: "באט תאילנדי" },
  { code: "MXN", label: "פזו מקסיקני" },
  { code: "TRY", label: "לירה טורקית" },
  { code: "NZD", label: "דולר ניו זילנדי" },
  { code: "SEK", label: "כתר שבדי" },
  { code: "NOK", label: "כתר נורבגי" },
  { code: "DKK", label: "כתר דני" },
  { code: "KRW", label: "וון דרום קוריאני" },
  { code: "INR", label: "רופי הודי" },
  { code: "IDR", label: "רופי אינדונזי" },
  { code: "PLN", label: "זלוטי" },
  { code: "RON", label: "לאו רומני" },
  { code: "ZAR", label: "ראנד דרא״פ" },
  { code: "HRK", label: "קונה" },
];
export const GI_CURRENCY_CODES = GI_CURRENCIES.map((c) => c.code);

/** spec: DocumentVatType — מע״מ ברמת המסמך */
export type GiDocVatType = 0 | 1 | 2;
export const GI_DOC_VAT_TYPE_LABELS: Record<GiDocVatType, string> = {
  0: "רגיל (לפי סוג העסק)",
  1: "פטור ממע״מ",
  2: "מעורב (שורות חייבות ופטורות)",
};

/** spec: ItemVatType — מע״מ ברמת שורת הכנסה */
export type GiRowVatType = 0 | 1 | 2;
export const GI_ROW_VAT_TYPE_LABELS: Record<GiRowVatType, string> = {
  0: "לפני מע״מ (יתווסף מע״מ)",
  1: "כולל מע״מ",
  2: "פטור ממע״מ",
};

/** spec: DocumentLinkType (copy|link|cancel); CreateDocumentRequest.linkType מתעד link/cancel; שגיאה 2404 מתירה את שלושתם */
export type GiLinkType = "link" | "cancel" | "copy";
export const GI_LINK_TYPE_LABELS: Record<GiLinkType, string> = {
  link: "קישור (מסמך קשור)",
  cancel: "ביטול / זיכוי המסמך",
  copy: "העתק של המסמך",
};

/** spec: DiscountRequest.type */
export type GiDiscountType = "sum" | "percentage";
export const GI_DISCOUNT_TYPE_LABELS: Record<GiDiscountType, string> = {
  sum: "סכום",
  percentage: "אחוז",
};

/** spec: DocumentStatus */
export const GI_DOC_STATUS_LABELS: Record<number, string> = {
  0: "פתוח",
  1: "סגור",
  2: "נסגר ידנית",
  3: "מסמך מבטל",
  4: "בוטל",
};

/** spec: BusinessType */
export const GI_BUSINESS_TYPE_LABELS: Record<number, string> = {
  1: "עוסק מורשה",
  2: "חברה בע״מ",
  3: "עוסק פטור",
  4: "עמותה",
  5: "חברה לתועלת הציבור",
  6: "שותפות",
};

/** spec: PaymentGroup */
export const GI_PAYMENT_TYPES = [0, 1, 2, 3, 4, 5, 10, 11] as const;
export type GiPaymentType = (typeof GI_PAYMENT_TYPES)[number];
export const GI_PAYMENT_TYPE_LABELS: Record<GiPaymentType, string> = {
  0: "ניכוי במקור",
  1: "מזומן",
  2: "צ׳ק",
  3: "כרטיס אשראי",
  4: "העברה בנקאית",
  5: "פייפאל",
  10: "אפליקציית תשלום",
  11: "אחר",
};

/** spec: CreditCardType */
export const GI_CARD_TYPE_LABELS: Record<number, string> = {
  0: "לא ידוע",
  1: "ישראכרט",
  2: "ויזה",
  3: "מאסטרקארד",
  4: "אמריקן אקספרס",
  5: "דיינרס",
};

/** spec: CreditCardDealType (התוויות בעברית — תרגום שלנו) */
export const GI_DEAL_TYPE_LABELS: Record<number, string> = {
  1: "רגילה",
  2: "תשלומים",
  3: "קרדיט",
  4: "חיוב נדחה",
  5: "אחר",
  6: "הוראת קבע",
};

/** spec: PaymentAppType */
export const GI_APP_TYPE_LABELS: Record<number, string> = {
  1: "Bit",
  2: "Pay",
  3: "PayBox",
  5: "Google Pay",
  6: "Apple Pay",
};

/** spec: OtherSubType ("required when using 'other' as a Payment type") */
export const GI_OTHER_SUBTYPE_LABELS: Record<number, string> = {
  1: "ביטקוין",
  2: "שווה כסף",
  3: "V-Check",
  4: "שובר מתנה",
  5: "ניכוי חלק עובד ביטוח לאומי",
  6: "אתריום",
  7: "BUYME שובר",
  9: "ניכוי אחר",
};

/** spec: PaymentPluginGroup */
export const GI_PLUGIN_GROUP_LABELS: Record<number, string> = {
  100: "כרטיס אשראי",
  110: "PayPal",
  120: "bit",
  150: "Google Pay",
  160: "Apple Pay",
  170: "שירות ייזום תשלום (PIS)",
};

// =============================================================================
// מגבלות (spec: טבלת השגיאות ותיאורי השדות)
// =============================================================================
export const GI_LIMITS = {
  /** 2431: עד 200 שורות הכנסה / תשלום למסמך */
  maxRows: 200,
  /** 2200: עד 3 כתובות מייל ללקוח (ClientRequest אומר 5 — נוקטים במחמיר) */
  maxClientEmails: 3,
  /** PaymentRowRequest.numPayments: 1–36; שגיאה 2425 */
  minNumPayments: 1,
  maxNumPayments: 36,
  /** 2608: 4 ספרות אחרונות של כרטיס */
  cardNumDigits: 4,
  /** 2124: טקסט תחתון עד 2000 תווים (מוגדר להגדרות העסק; מיושם גם כאן) */
  maxFooterLength: 2000,
  /** 1108: שיעור מע״מ בין 0 ל-1 */
  minVatRate: 0,
  maxVatRate: 1,
  /** 1119: pageSize בחיפוש עד 100 */
  maxSearchPageSize: 100,
} as const;

/** ברירת מחדל לשיעור המע״מ (DocumentInfo.vatRate מחזיר את הערך בפועל לעסק) */
export const GI_DEFAULT_VAT_RATE = 0.18;

// =============================================================================
// שדות ברמת המסמך
// =============================================================================
export type GiRule = "required" | "optional" | "forbidden";
export type GiSource = "spec" | "inferred";

/** כל השדות ב-CreateDocumentRequest (+ שדות לקוח שמשתנים לפי סוג) */
export type GiDocField =
  | "date"
  | "dueDate"
  | "lang"
  | "currency"
  | "vatType"
  | "discount"
  | "rounding"
  | "signed"
  | "description"
  | "remarks"
  | "footer"
  | "emailContent"
  | "attachment"
  | "client"
  | "clientSelf"
  | "income"
  | "payment"
  | "linkedDocumentIds"
  | "linkType"
  | "linkedPaymentId"
  | "paymentRequestData";

export type GiFieldMeta = {
  /** תווית בעברית כפי שמופיעה בטופס */
  label: string;
  /** שם השדה ב-API */
  apiName: string;
  /** תיאור קצר (מה-spec, בעברית) */
  description: string;
};

export const GI_DOC_FIELD_META: Record<GiDocField, GiFieldMeta> = {
  date: { label: "תאריך המסמך", apiName: "date", description: "YYYY-MM-DD. ברירת מחדל: היום." },
  dueDate: { label: "תאריך לתשלום", apiName: "dueDate", description: "YYYY-MM-DD. מועד התשלום." },
  lang: { label: "שפת המסמך", apiName: "lang", description: "he / en." },
  currency: { label: "מטבע", apiName: "currency", description: "קוד ISO בן 3 אותיות." },
  vatType: { label: "סוג מע״מ למסמך", apiName: "vatType", description: "0 רגיל, 1 פטור, 2 מעורב." },
  discount: { label: "הנחה", apiName: "discount", description: "{amount, type: sum|percentage}. ההנחה לא כוללת מע״מ." },
  rounding: { label: "עיגול סכומים", apiName: "rounding", description: "ברירת מחדל: לא." },
  signed: { label: "חתימה דיגיטלית", apiName: "signed", description: "ברירת מחדל: כן." },
  description: { label: "תיאור המסמך", apiName: "description", description: "כותרת / תיאור." },
  remarks: { label: "הערות", apiName: "remarks", description: "הערות שמופיעות במסמך." },
  footer: { label: "טקסט תחתון", apiName: "footer", description: "טקסט בתחתית המסמך." },
  emailContent: { label: "תוכן נוסף למייל", apiName: "emailContent", description: "טקסט שמתווסף למייל ללקוח." },
  attachment: { label: "צירוף PDF למייל", apiName: "attachment", description: "ברירת מחדל: לא." },
  client: { label: "לקוח", apiName: "client", description: "id של לקוח קיים, או פרטים מלאים (+ add להוספה לרשימת הלקוחות)." },
  clientSelf: { label: "חשבונית עצמית", apiName: "client.self", description: "רק בחשבונית מס (305)." },
  income: { label: "שורות הכנסה", apiName: "income", description: "פריטים / שירותים." },
  payment: { label: "שורות תקבול", apiName: "payment", description: "אמצעי התשלום שהתקבלו." },
  linkedDocumentIds: { label: "מסמכים מקושרים", apiName: "linkedDocumentIds", description: "מזהי מסמכי Morning קשורים." },
  linkType: { label: "סוג הקישור", apiName: "linkType", description: "link / cancel (וגם copy)." },
  linkedPaymentId: { label: "מזהה תשלום מקושר", apiName: "linkedPaymentId", description: "רק בחשבונית מס (305)." },
  paymentRequestData: {
    label: "בקשת תשלום מקוון",
    apiName: "paymentRequestData",
    description: "plugins[{id, group, type}] + maxPayments — כפתור תשלום במסמך.",
  },
};

// =============================================================================
// שדות שורת הכנסה (spec: IncomeRowRequest)
// =============================================================================
export type GiRowFieldDef = {
  key: string;
  label: string;
  required: boolean;
  kind: "text" | "number" | "integer" | "enum" | "date";
  enumLabels?: Record<number | string, string>;
  min?: number;
  max?: number;
  note?: string;
  source: GiSource;
};

export const GI_INCOME_ROW_FIELDS: GiRowFieldDef[] = [
  { key: "description", label: "תיאור", required: true, kind: "text", note: "לא ריק (2415)", source: "spec" },
  { key: "quantity", label: "כמות", required: true, kind: "number", note: "חיובית (2430)", source: "spec" },
  { key: "price", label: "מחיר ליחידה", required: true, kind: "number", note: "מחיר שלילי = שורת הנחה (מותר כל עוד סה״כ המסמך תקין)", source: "spec" },
  { key: "currency", label: "מטבע", required: true, kind: "enum", note: "בטופס: מטבע המסמך", source: "spec" },
  { key: "currencyRate", label: "שער המרה לשקל", required: false, kind: "number", min: 0, note: "ברירת מחדל 1; גדול מאפס (1107)", source: "spec" },
  { key: "vatType", label: "מע״מ בשורה", required: true, kind: "enum", enumLabels: GI_ROW_VAT_TYPE_LABELS, source: "spec" },
  { key: "vatRate", label: "שיעור מע״מ", required: false, kind: "number", min: 0, max: 1, note: "למשל 0.18; בין 0 ל-1 (1108)", source: "spec" },
  { key: "catalogNum", label: "מק״ט", required: false, kind: "text", source: "spec" },
  { key: "itemId", label: "מזהה פריט ב-Morning", required: false, kind: "text", source: "spec" },
];

// =============================================================================
// שדות שורת תקבול (spec: PaymentRowRequest)
// =============================================================================
export const GI_PAYMENT_ROW_COMMON_FIELDS: GiRowFieldDef[] = [
  { key: "type", label: "אמצעי תשלום", required: true, kind: "enum", enumLabels: GI_PAYMENT_TYPE_LABELS, note: "2421", source: "spec" },
  { key: "date", label: "תאריך התשלום", required: true, kind: "date", note: "לא ריק ולא עתידי (2426)", source: "spec" },
  { key: "price", label: "סכום", required: true, kind: "number", note: "שונה מאפס (2434)", source: "spec" },
  { key: "currency", label: "מטבע", required: true, kind: "enum", source: "spec" },
  { key: "currencyRate", label: "שער המרה לשקל", required: false, kind: "number", min: 0, source: "spec" },
];

/** שדות ייחודיים לכל אמצעי תשלום */
export const GI_PAYMENT_TYPE_FIELDS: Record<GiPaymentType, GiRowFieldDef[]> = {
  0: [],
  1: [],
  2: [
    { key: "chequeNum", label: "מספר צ׳ק", required: true, kind: "text", note: "spec: required when using cheques", source: "spec" },
    { key: "bankName", label: "בנק", required: true, kind: "text", source: "spec" },
    { key: "bankBranch", label: "סניף", required: true, kind: "text", note: "עד 5 תווים (2109)", source: "spec" },
    { key: "bankAccount", label: "מספר חשבון", required: true, kind: "text", source: "spec" },
  ],
  3: [
    { key: "cardType", label: "סוג כרטיס", required: false, kind: "enum", enumLabels: GI_CARD_TYPE_LABELS, note: "2423", source: "spec" },
    { key: "cardNum", label: "4 ספרות אחרונות", required: false, kind: "text", note: "בדיוק 4 ספרות (2608)", source: "spec" },
    { key: "dealType", label: "סוג עסקה", required: false, kind: "enum", enumLabels: GI_DEAL_TYPE_LABELS, note: "2424", source: "spec" },
    { key: "numPayments", label: "מספר תשלומים", required: false, kind: "integer", min: 1, max: 36, note: "1–36 (2425)", source: "spec" },
    { key: "firstPayment", label: "סכום תשלום ראשון", required: false, kind: "number", source: "spec" },
  ],
  4: [
    { key: "bankName", label: "בנק", required: false, kind: "text", note: "spec: שדה כללי; חובה רק בצ׳ק", source: "inferred" },
    { key: "bankBranch", label: "סניף", required: false, kind: "text", source: "inferred" },
    { key: "bankAccount", label: "מספר חשבון", required: false, kind: "text", source: "inferred" },
  ],
  5: [
    { key: "accountId", label: "חשבון המשלם", required: false, kind: "text", source: "spec" },
    { key: "transactionId", label: "מזהה עסקה", required: false, kind: "text", source: "spec" },
  ],
  10: [
    { key: "appType", label: "אפליקציה", required: false, kind: "enum", enumLabels: GI_APP_TYPE_LABELS, source: "spec" },
    { key: "accountId", label: "חשבון המשלם", required: false, kind: "text", source: "spec" },
    { key: "transactionId", label: "מזהה עסקה", required: false, kind: "text", source: "spec" },
  ],
  11: [
    { key: "subType", label: "סוג התשלום", required: true, kind: "enum", enumLabels: GI_OTHER_SUBTYPE_LABELS, note: "spec: required when using 'other'", source: "spec" },
    { key: "accountId", label: "חשבון המשלם", required: false, kind: "text", source: "spec" },
    { key: "transactionId", label: "מזהה עסקה", required: false, kind: "text", source: "spec" },
  ],
};

// =============================================================================
// הגדרת סוג מסמך
// =============================================================================
export type GiTypicalLink = { to: GiDocType; linkType: GiLinkType; note: string; source: GiSource };

export type GiDocTypeDef = {
  type: GiDocType;
  /** השם בעברית כפי שמופיע ב-spec (DocumentType) */
  name: string;
  /** תיאור קצר לטופס */
  hint: string;
  group: "sales" | "tax" | "receipts" | "logistics" | "purchase" | "deposits" | "donations";
  /** מי הצד השני: לקוח, או ספק (הזמנת רכש) — inferred */
  counterparty: "customer" | "supplier";
  /** מסמך מס (רשות המסים) — inferred; קובע את כלל התאריך העתידי */
  taxDocument: boolean;
  /** תאריך עתידי מותר? (2405: "עתידי או מוקדם מדי לסוג מסמך זה") — inferred לפי סוג */
  futureDateAllowed: boolean;
  /** כל השדות ברמת המסמך */
  fields: Record<Exclude<GiDocField, "income" | "payment">, GiRule>;
  /** שורות הכנסה: required = לפחות שורה אחת; optional = מותר מערך ריק; forbidden = נשלח [] */
  income: GiRule;
  /** שורות תקבול */
  payment: GiRule;
  /** סכום התקבולים חייב להיות שווה לסה״כ ההכנסות (2422) */
  paymentsMustEqualTotal: "always" | "whenIncome" | "never";
  /** סה״כ: positive (>0, 2417), nonzero (≠0, 2416), nonnegative (≥0, 2418) */
  totalSign: "positive" | "nonnegative" | "nonzero";
  /** סוגי הקישור המותרים כשמקשרים מסמכים */
  linkTypes: GiLinkType[];
  /** קישור ברירת מחדל */
  defaultLinkType: GiLinkType;
  /** לאילו מסמכים הסוג הזה מקושר בדרך כלל */
  typicalLinks: GiTypicalLink[];
  /** אילו סוגי עסק מורשים להפיק (2403) — אין ב-spec רשימה; null = לא ידוע / כולם */
  businessTypes: { allowed?: number[]; excluded?: number[]; source: GiSource; note: string } | null;
  /** הסוג הזה מפיק מסמך שאפשר ליצור דרך תשלום (spec: PaidDocumentType) */
  paidDocumentType: boolean;
  /** הפקה מותרת למנהל בלבד (מדיניות ה-CRM) */
  adminOnly: boolean;
  /** documents.kind אצלנו */
  crmKind:
    | "customer_invoice"
    | "customer_invoice_receipt"
    | "customer_receipt"
    | "customer_credit_note"
    | "other";
  /** כללים מה-spec שחלים על הסוג */
  specNotes: string[];
  /** כללים שהוסקו (לא ב-spec) */
  inferredNotes: string[];
};

type Fields = GiDocTypeDef["fields"];

/** שדות שחלים על כל המסמכים (spec: CreateDocumentRequest — required: type, lang, currency, vatType, income) */
const BASE_FIELDS: Fields = {
  date: "optional",
  dueDate: "forbidden",
  lang: "required",
  currency: "required",
  vatType: "required",
  discount: "forbidden",
  rounding: "forbidden",
  signed: "optional",
  description: "optional",
  remarks: "optional",
  footer: "optional",
  emailContent: "optional",
  attachment: "optional",
  client: "required",
  clientSelf: "forbidden",
  linkedDocumentIds: "optional",
  linkType: "optional",
  linkedPaymentId: "forbidden",
  paymentRequestData: "forbidden",
};

/** מסמך עם שורות הכנסה: הנחה ועיגול רלוונטיים */
const INCOME_DOC_FIELDS: Fields = { ...BASE_FIELDS, discount: "optional", rounding: "optional" };

const LINK_COPY: GiLinkType[] = ["link", "copy"];

function def(d: Omit<GiDocTypeDef, "defaultLinkType"> & { defaultLinkType?: GiLinkType }): GiDocTypeDef {
  return { defaultLinkType: d.linkTypes[0], ...d };
}

export const GI_DOC_TYPE_DEFS: Record<GiDocType, GiDocTypeDef> = {
  10: def({
    type: 10,
    name: "הצעת מחיר",
    hint: "הצעה ללקוח — לא מסמך מס",
    group: "sales",
    counterparty: "customer",
    taxDocument: false,
    futureDateAllowed: true,
    fields: { ...INCOME_DOC_FIELDS, dueDate: "optional", paymentRequestData: "optional" },
    income: "required",
    payment: "forbidden",
    paymentsMustEqualTotal: "never",
    totalSign: "nonnegative",
    linkTypes: LINK_COPY,
    typicalLinks: [],
    businessTypes: null,
    paidDocumentType: false,
    adminOnly: false,
    crmKind: "other",
    specNotes: ["income נדרש בסכמה (CreateDocumentRequest.required)"],
    inferredNotes: ["אין תקבולים", "תאריך עתידי מותר", "dueDate משמש כ\"בתוקף עד\""],
  }),
  20: def({
    type: 20,
    name: "חשבון / אישור תשלום",
    hint: "דרישת / אישור תשלום שאינו חשבונית מס",
    group: "sales",
    counterparty: "customer",
    taxDocument: false,
    futureDateAllowed: false,
    fields: { ...INCOME_DOC_FIELDS, dueDate: "optional", paymentRequestData: "optional" },
    income: "required",
    payment: "optional",
    paymentsMustEqualTotal: "never",
    totalSign: "positive",
    linkTypes: LINK_COPY,
    typicalLinks: [
      { to: 10, linkType: "link", note: "חשבון על הצעת מחיר", source: "inferred" },
      { to: 100, linkType: "link", note: "חשבון על הזמנה", source: "inferred" },
    ],
    businessTypes: null,
    paidDocumentType: false,
    adminOnly: false,
    crmKind: "other",
    specNotes: ["סוג 20 קיים ב-DocumentType ו-ExpenseDocumentType"],
    inferredNotes: ["תקבולים אופציונליים", "לא עתידי"],
  }),
  100: def({
    type: 100,
    name: "הזמנה",
    hint: "הזמנת עבודה / מכירה מהלקוח",
    group: "sales",
    counterparty: "customer",
    taxDocument: false,
    futureDateAllowed: true,
    fields: { ...INCOME_DOC_FIELDS, dueDate: "optional", paymentRequestData: "optional" },
    income: "required",
    payment: "forbidden",
    paymentsMustEqualTotal: "never",
    totalSign: "nonnegative",
    linkTypes: LINK_COPY,
    typicalLinks: [{ to: 10, linkType: "link", note: "הזמנה מהצעת מחיר", source: "inferred" }],
    businessTypes: null,
    paidDocumentType: false,
    adminOnly: false,
    crmKind: "other",
    specNotes: [],
    inferredNotes: ["אין תקבולים", "תאריך עתידי מותר"],
  }),
  200: def({
    type: 200,
    name: "תעודת משלוח",
    hint: "סחורה שנמסרה ללקוח",
    group: "logistics",
    counterparty: "customer",
    taxDocument: false,
    futureDateAllowed: true,
    fields: { ...INCOME_DOC_FIELDS },
    income: "required",
    payment: "forbidden",
    paymentsMustEqualTotal: "never",
    totalSign: "nonnegative",
    linkTypes: LINK_COPY,
    typicalLinks: [
      { to: 100, linkType: "link", note: "משלוח של הזמנה", source: "inferred" },
      { to: 10, linkType: "link", note: "משלוח לפי הצעת מחיר", source: "inferred" },
    ],
    businessTypes: null,
    paidDocumentType: false,
    adminOnly: false,
    crmKind: "other",
    specNotes: [],
    inferredNotes: ["אין תקבולים ואין תאריך לתשלום"],
  }),
  210: def({
    type: 210,
    name: "תעודת החזרה",
    hint: "סחורה שהוחזרה מהלקוח",
    group: "logistics",
    counterparty: "customer",
    taxDocument: false,
    futureDateAllowed: true,
    fields: { ...INCOME_DOC_FIELDS },
    income: "required",
    payment: "forbidden",
    paymentsMustEqualTotal: "never",
    totalSign: "nonnegative",
    linkTypes: ["link", "cancel", "copy"],
    typicalLinks: [{ to: 200, linkType: "link", note: "החזרה של תעודת משלוח", source: "inferred" }],
    businessTypes: null,
    paidDocumentType: false,
    adminOnly: false,
    crmKind: "other",
    specNotes: [],
    inferredNotes: ["הכמויות נכתבות כחיוביות", "מקושרת לתעודת המשלוח המקורית"],
  }),
  300: def({
    type: 300,
    name: "חשבון עסקה",
    hint: "דרישת תשלום (פרופורמה) — לא חשבונית מס",
    group: "sales",
    counterparty: "customer",
    taxDocument: false,
    futureDateAllowed: true,
    fields: { ...INCOME_DOC_FIELDS, dueDate: "optional", paymentRequestData: "optional" },
    income: "required",
    payment: "forbidden",
    paymentsMustEqualTotal: "never",
    totalSign: "positive",
    linkTypes: LINK_COPY,
    typicalLinks: [
      { to: 10, linkType: "link", note: "חשבון עסקה מהצעת מחיר", source: "inferred" },
      { to: 100, linkType: "link", note: "חשבון עסקה להזמנה", source: "inferred" },
      { to: 200, linkType: "link", note: "חשבון עסקה לתעודת משלוח", source: "inferred" },
    ],
    businessTypes: null,
    paidDocumentType: false,
    adminOnly: false,
    crmKind: "other",
    specNotes: ["DocumentInfo.settings.taxAuthorityProformaInvoiceEnabled — דיווח פרופורמה לרשות המסים"],
    inferredNotes: ["אין תקבולים (התשלום מתועד בקבלה 400 שמקושרת אליו)"],
  }),
  305: def({
    type: 305,
    name: "חשבונית מס",
    hint: "חשבונית מס ללקוח (בלי תקבול)",
    group: "tax",
    counterparty: "customer",
    taxDocument: true,
    futureDateAllowed: false,
    fields: {
      ...INCOME_DOC_FIELDS,
      dueDate: "optional",
      clientSelf: "optional",
      linkedPaymentId: "optional",
      paymentRequestData: "optional",
    },
    income: "required",
    payment: "forbidden",
    paymentsMustEqualTotal: "never",
    totalSign: "positive",
    linkTypes: LINK_COPY,
    typicalLinks: [
      { to: 10, linkType: "link", note: "חשבונית על הצעת מחיר", source: "inferred" },
      { to: 100, linkType: "link", note: "חשבונית על הזמנה", source: "inferred" },
      { to: 200, linkType: "link", note: "חשבונית על תעודת משלוח", source: "inferred" },
      { to: 300, linkType: "link", note: "חשבונית מס לחשבון עסקה", source: "inferred" },
    ],
    businessTypes: { excluded: [3], source: "inferred", note: "עוסק פטור אינו מפיק חשבונית מס (שגיאה 2403)" },
    paidDocumentType: false,
    adminOnly: false,
    crmKind: "customer_invoice",
    specNotes: [
      "linkedPaymentId — רק בחשבונית מס (305)",
      "client.self (חשבונית עצמית) — רק בחשבונית מס (שגיאה 2412)",
      "2413: לפחות שורת הכנסה אחת",
    ],
    inferredNotes: ["אין תקבולים — התשלום בקבלה 400 שמקושרת אליה", "לא עתידי ולא לפני המסמך האחרון מאותו סוג (2405)"],
  }),
  320: def({
    type: 320,
    name: "חשבונית מס / קבלה",
    hint: "חשבונית מס + קבלה על תשלום מלא",
    group: "tax",
    counterparty: "customer",
    taxDocument: true,
    futureDateAllowed: false,
    fields: { ...INCOME_DOC_FIELDS },
    income: "required",
    payment: "required",
    paymentsMustEqualTotal: "always",
    totalSign: "positive",
    linkTypes: LINK_COPY,
    typicalLinks: [
      { to: 10, linkType: "link", note: "על הצעת מחיר", source: "inferred" },
      { to: 100, linkType: "link", note: "על הזמנה", source: "inferred" },
      { to: 200, linkType: "link", note: "על תעודת משלוח", source: "inferred" },
      { to: 300, linkType: "link", note: "סגירת חשבון עסקה", source: "inferred" },
    ],
    businessTypes: { excluded: [3], source: "inferred", note: "עוסק פטור אינו מפיק חשבונית מס" },
    paidDocumentType: true,
    adminOnly: false,
    crmKind: "customer_invoice_receipt",
    specNotes: [
      "PaidDocumentType כולל 320",
      "2419: לפחות שורת תקבול אחת",
      "2422: סכום התקבולים = סכום ההכנסות",
      "2428: צריך תקבול נוסף מלבד ניכוי במקור",
    ],
    inferredNotes: ["לא עתידי"],
  }),
  330: def({
    type: 330,
    name: "חשבונית זיכוי",
    hint: "ביטול / זיכוי של חשבונית מס",
    group: "tax",
    counterparty: "customer",
    taxDocument: true,
    futureDateAllowed: false,
    fields: { ...INCOME_DOC_FIELDS },
    income: "required",
    payment: "forbidden",
    paymentsMustEqualTotal: "never",
    totalSign: "positive",
    linkTypes: ["cancel", "link"],
    typicalLinks: [
      { to: 305, linkType: "cancel", note: "זיכוי חשבונית מס", source: "inferred" },
      { to: 320, linkType: "cancel", note: "זיכוי חשבונית מס/קבלה", source: "inferred" },
    ],
    businessTypes: { excluded: [3], source: "inferred", note: "עוסק פטור אינו מפיק חשבונית מס" },
    paidDocumentType: false,
    adminOnly: true,
    crmKind: "customer_credit_note",
    specNotes: ["linkType=cancel: \"Document cancels another\"", "DocumentStatus 3 מבטל / 4 בוטל"],
    inferredNotes: [
      "הסכומים נכתבים כחיוביים (כיוון הסימן לא מוגדר ב-spec)",
      "בדרך כלל מקושרת בביטול (cancel) לחשבונית המקורית",
      "מנהל בלבד (מדיניות ה-CRM)",
    ],
  }),
  400: def({
    type: 400,
    name: "קבלה",
    hint: "קבלה על תשלום (בדרך כלל על חשבונית)",
    group: "receipts",
    counterparty: "customer",
    taxDocument: true,
    futureDateAllowed: false,
    fields: { ...BASE_FIELDS },
    income: "optional",
    payment: "required",
    paymentsMustEqualTotal: "whenIncome",
    totalSign: "positive",
    linkTypes: LINK_COPY,
    typicalLinks: [
      { to: 305, linkType: "link", note: "קבלה על חשבונית מס — סוגרת אותה", source: "spec" },
      { to: 300, linkType: "link", note: "קבלה על חשבון עסקה", source: "inferred" },
      { to: 20, linkType: "link", note: "קבלה על חשבון / אישור תשלום", source: "inferred" },
    ],
    businessTypes: null,
    paidDocumentType: true,
    adminOnly: false,
    crmKind: "customer_receipt",
    specNotes: [
      "linkedDocumentIds: \"When creating a receipt, include the original invoice document ID — this will automatically close the original invoice\"",
      "PaidDocumentType כולל 400",
      "2419: לפחות שורת תקבול אחת",
      "DocumentInfo.settings.receiptIncomeEnabled — האם קבלה יכולה לכלול שורות הכנסה",
    ],
    inferredNotes: ["income נשלח כ-[] כשאין שורות", "כשיש שורות הכנסה — סכומן = סכום התקבולים"],
  }),
  405: def({
    type: 405,
    name: "קבלה על תרומה",
    hint: "קבלה על תרומה (סעיף 46)",
    group: "donations",
    counterparty: "customer",
    taxDocument: true,
    futureDateAllowed: false,
    fields: { ...BASE_FIELDS },
    income: "optional",
    payment: "required",
    paymentsMustEqualTotal: "whenIncome",
    totalSign: "positive",
    linkTypes: LINK_COPY,
    typicalLinks: [],
    businessTypes: { allowed: [4, 5], source: "inferred", note: "בדרך כלל עמותה / חל״צ בלבד (שגיאה 2403)" },
    paidDocumentType: true,
    adminOnly: false,
    crmKind: "customer_receipt",
    specNotes: ["PaidDocumentType כולל 405"],
    inferredNotes: ["כמו קבלה 400"],
  }),
  410: def({
    type: 410,
    name: "ביטול תרומה",
    hint: "ביטול קבלה על תרומה",
    group: "donations",
    counterparty: "customer",
    taxDocument: true,
    futureDateAllowed: false,
    fields: { ...BASE_FIELDS },
    income: "forbidden",
    payment: "required",
    paymentsMustEqualTotal: "never",
    totalSign: "positive",
    linkTypes: ["cancel", "link"],
    typicalLinks: [{ to: 405, linkType: "cancel", note: "ביטול קבלה על תרומה", source: "inferred" }],
    businessTypes: { allowed: [4, 5], source: "inferred", note: "בדרך כלל עמותה / חל״צ בלבד" },
    paidDocumentType: false,
    adminOnly: true,
    crmKind: "other",
    specNotes: ["סוג 410 קיים ב-DocumentType"],
    inferredNotes: ["שורות תקבול = ההחזר", "מקושר בביטול (cancel) לקבלה על התרומה", "מנהל בלבד (מדיניות ה-CRM, כמו זיכוי)"],
  }),
  500: def({
    type: 500,
    name: "הזמנת רכש",
    hint: "הזמנה מספק (הצד השני הוא ספק)",
    group: "purchase",
    counterparty: "supplier",
    taxDocument: false,
    futureDateAllowed: true,
    fields: { ...INCOME_DOC_FIELDS, dueDate: "optional" },
    income: "required",
    payment: "forbidden",
    paymentsMustEqualTotal: "never",
    totalSign: "nonnegative",
    linkTypes: LINK_COPY,
    typicalLinks: [],
    businessTypes: null,
    paidDocumentType: false,
    adminOnly: false,
    crmKind: "other",
    specNotes: ["הספק נשלח בשדה client (אין שדה supplier ב-CreateDocumentRequest)"],
    inferredNotes: ["אין תקבולים", "תאריך עתידי מותר"],
  }),
  600: def({
    type: 600,
    name: "קבלת פיקדון",
    hint: "קבלה על פיקדון / ערבון",
    group: "deposits",
    counterparty: "customer",
    taxDocument: true,
    futureDateAllowed: false,
    fields: { ...BASE_FIELDS },
    income: "forbidden",
    payment: "required",
    paymentsMustEqualTotal: "never",
    totalSign: "positive",
    linkTypes: LINK_COPY,
    typicalLinks: [],
    businessTypes: null,
    paidDocumentType: true,
    adminOnly: false,
    crmKind: "other",
    specNotes: ["PaidDocumentType כולל 600"],
    inferredNotes: ["אין שורות הכנסה (פיקדון אינו הכנסה)", "income נשלח כ-[]"],
  }),
  610: def({
    type: 610,
    name: "משיכת פיקדון",
    hint: "החזרת פיקדון ללקוח",
    group: "deposits",
    counterparty: "customer",
    taxDocument: true,
    futureDateAllowed: false,
    fields: { ...BASE_FIELDS },
    income: "forbidden",
    payment: "required",
    paymentsMustEqualTotal: "never",
    totalSign: "positive",
    linkTypes: ["link", "cancel"],
    typicalLinks: [{ to: 600, linkType: "link", note: "משיכה מתוך קבלת פיקדון", source: "inferred" }],
    businessTypes: null,
    paidDocumentType: false,
    adminOnly: true,
    crmKind: "other",
    specNotes: ["סוג 610 קיים ב-DocumentType"],
    inferredNotes: ["שורות תקבול = ההחזר", "מקושרת לקבלת הפיקדון", "מנהל בלבד (מדיניות ה-CRM)"],
  }),
};

export const GI_DOC_TYPE_LIST: GiDocTypeDef[] = GI_DOC_TYPES.map((t) => GI_DOC_TYPE_DEFS[t]);

export const GI_DOC_TYPE_GROUPS: { label: string; types: GiDocType[] }[] = [
  { label: "מכירה", types: [10, 100, 300, 20] },
  { label: "מסמכי מס", types: [305, 320, 330] },
  { label: "קבלות", types: [400] },
  { label: "משלוח והחזרה", types: [200, 210] },
  { label: "רכש", types: [500] },
  { label: "פיקדונות", types: [600, 610] },
  { label: "תרומות", types: [405, 410] },
];

export function giDocTypeName(type: number | null | undefined): string {
  return type != null && isGiDocType(type) ? GI_DOC_TYPE_DEFS[type].name : type != null ? `מסמך ${type}` : "מסמך";
}

/** סוגים שמותרים להפקה רק למנהל (מדיניות CRM) */
export const GI_ADMIN_ONLY_TYPES: GiDocType[] = GI_DOC_TYPES.filter((t) => GI_DOC_TYPE_DEFS[t].adminOnly);

export function canRoleIssue(type: GiDocType, role: "admin" | "agent"): boolean {
  return role === "admin" || !GI_DOC_TYPE_DEFS[type].adminOnly;
}

/** סוגי מסמך שאפשר לקשר אליהם מסמך מהסוג הנתון (לפי typicalLinks; ריק = כל סוג) */
export function typicalLinkTargets(type: GiDocType): GiDocType[] {
  return GI_DOC_TYPE_DEFS[type].typicalLinks.map((l) => l.to);
}

/** סוג הקישור המומלץ בין שני סוגים */
export function suggestedLinkType(from: GiDocType, to: number | null | undefined): GiLinkType {
  const d = GI_DOC_TYPE_DEFS[from];
  const hit = d.typicalLinks.find((l) => l.to === to);
  return hit?.linkType ?? d.defaultLinkType;
}

export const GI_RULE_LABELS: Record<GiRule, string> = {
  required: "חובה",
  optional: "רשות",
  forbidden: "לא רלוונטי",
};
