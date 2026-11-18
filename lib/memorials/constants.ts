/** מצב "מצבות" — לקוחות פרטיים. קבועים, תוויות וטיפוסים משותפים לשרת וללקוח. */

export const MEM_STAGES = [
  "call",
  "quote",
  "deposit",
  "render_approval",
  "production",
  "engraving",
  "installation",
  "done",
  "cancelled",
] as const;
export type MemStage = (typeof MEM_STAGES)[number];

/** שלבי העבודה לפי סדר (בלי סגור / בוטל) */
export const MEM_PIPELINE_STAGES: MemStage[] = [
  "call",
  "quote",
  "deposit",
  "render_approval",
  "production",
  "engraving",
  "installation",
];

export const MEM_STAGE_LABELS: Record<MemStage, string> = {
  call: "שיחה",
  quote: "הצעה",
  deposit: "מקדמה",
  render_approval: "אישור הדמיה",
  production: "ייצור",
  engraving: "חריטה",
  installation: "התקנה",
  done: "הושלם",
  cancelled: "בוטל",
};

export const MEM_ORDER_KINDS = ["headstone", "cleaning", "lettering", "other"] as const;
export type MemOrderKind = (typeof MEM_ORDER_KINDS)[number];
export const MEM_ORDER_KIND_LABELS: Record<MemOrderKind, string> = {
  headstone: "מצבה",
  cleaning: "ניקוי קבר",
  lettering: "חידוש אותיות",
  other: "אחר",
};

export const MEM_LEAD_STATUSES = ["new", "contacted", "converted", "lost", "spam"] as const;
export type MemLeadStatus = (typeof MEM_LEAD_STATUSES)[number];
export const MEM_LEAD_STATUS_LABELS: Record<MemLeadStatus, string> = {
  new: "חדש — להתקשר",
  contacted: "דיברנו",
  converted: "הפך להזמנה",
  lost: "לא רלוונטי",
  spam: "ספאם",
};

export const MEM_LEAD_SOURCES = [
  "contact",
  "configurator",
  "service",
  "obituary",
  "google_lead_form",
  "phone",
  "manual",
  "other",
] as const;
export type MemLeadSource = (typeof MEM_LEAD_SOURCES)[number];
export const MEM_LEAD_SOURCE_LABELS: Record<MemLeadSource, string> = {
  contact: "טופס יצירת קשר",
  configurator: "מעצב המצבות באתר",
  service: "טופס שירות (ניקוי / אותיות)",
  obituary: "מודעת אבל",
  google_lead_form: "טופס לידים של Google",
  phone: "שיחת טלפון",
  manual: "הוזן ידנית",
  other: "אחר",
};

export const MEM_PAYMENT_METHODS = ["cash", "cheque", "card", "transfer", "app", "other"] as const;
export type MemPaymentMethod = (typeof MEM_PAYMENT_METHODS)[number];
export const MEM_PAYMENT_METHOD_LABELS: Record<MemPaymentMethod, string> = {
  cash: "מזומן",
  cheque: "צ׳ק",
  card: "כרטיס אשראי",
  transfer: "העברה בנקאית",
  app: "ביט / פייבוקס",
  other: "אחר",
};

/** מסמכי Morning שמותרים בהזמנות פרטיות */
export const MEM_DOC_TYPES = [300, 305, 320, 400, 330] as const;
export type MemDocType = (typeof MEM_DOC_TYPES)[number];
export const MEM_DOC_TYPE_LABELS: Record<MemDocType, string> = {
  300: "חשבונית עסקה",
  305: "חשבונית מס",
  320: "חשבונית מס קבלה",
  400: "קבלה",
  330: "חשבונית זיכוי",
};

export const MEM_REMINDER_KIND_LABELS: Record<string, string> = {
  follow_up: "מעקב",
  shloshim: "שלושים",
  azkara: "אזכרה",
  custom: "תזכורת",
};

export type MemLeadRow = {
  id: string;
  created_at: string;
  updated_at: string;
  source: MemLeadSource;
  status: MemLeadStatus;
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  summary: string | null;
  deceased_name: string | null;
  death_date: string | null;
  design_code: string | null;
  design_url: string | null;
  page_url: string | null;
  landing_page: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  marketing_consent: boolean;
  external_id: string | null;
  first_contact_at: string | null;
  lost_reason: string | null;
  notes: string | null;
  assigned_to: string | null;
  order_id: string | null;
};

export type MemOrderRow = {
  id: string;
  number: number;
  created_at: string;
  updated_at: string;
  lead_id: string | null;
  kind: MemOrderKind;
  stage: MemStage;
  customer_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  deceased_name: string | null;
  death_date: string | null;
  hebrew_death_date: string | null;
  cemetery: string | null;
  grave_location: string | null;
  price: number | null;
  deposit_amount: number | null;
  design_code: string | null;
  design_url: string | null;
  wording: string | null;
  installation_date: string | null;
  notes: string | null;
  cancel_reason: string | null;
};

export type MemImageMeta = {
  id: string;
  created_at: string;
  kind: "design" | "render" | "signature" | "other";
  mime: string;
  bytes: number;
  lead_id: string | null;
  order_id: string | null;
};

export const MEM_LEAD_SELECT =
  "id, created_at, updated_at, source, status, name, phone, email, message, summary, deceased_name, death_date, design_code, design_url, page_url, landing_page, referrer, utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, gbraid, wbraid, marketing_consent, external_id, first_contact_at, lost_reason, notes, assigned_to, order_id";

export const MEM_IMAGE_META_SELECT = "id, created_at, kind, mime, bytes, lead_id, order_id";

export function memImageUrl(id: string): string {
  return `/dashboard/memorials/images/${id}`;
}
