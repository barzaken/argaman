/**
 * שגיאות Green Invoice (Morning). התשובות של Morning כבר בעברית
 * ({ errorCode, errorMessage }) — מציגים אותן כמו שהן, ומוסיפים טקסט חלופי
 * כשההודעה ריקה. בטוח לייבא גם מקוד לקוח (אין כאן סודות).
 */

export type GreenInvoiceErrorKind =
  | "not_configured"
  | "auth"
  | "http"
  | "rate_limited"
  | "timeout"
  | "network"
  | "invalid_response";

export class GreenInvoiceError extends Error {
  readonly kind: GreenInvoiceErrorKind;
  readonly status: number | null;
  /** קוד השגיאה של Morning (למשל 2422) או קוד OAuth2 (invalid_client) */
  readonly errorCode: number | string | null;
  /** הודעה בעברית, מוכנה להצגה */
  readonly errorMessage: string;
  /**
   * true כשאי אפשר לדעת אם הבקשה בוצעה (timeout / ניתוק / 5xx על POST).
   * במקרה כזה אסור לנסות שוב אוטומטית — ייתכן שהמסמך כבר הופק.
   */
  readonly ambiguous: boolean;

  constructor(opts: {
    kind: GreenInvoiceErrorKind;
    status?: number | null;
    errorCode?: number | string | null;
    errorMessage: string;
    ambiguous?: boolean;
  }) {
    super(opts.errorMessage);
    this.name = "GreenInvoiceError";
    this.kind = opts.kind;
    this.status = opts.status ?? null;
    this.errorCode = opts.errorCode ?? null;
    this.errorMessage = opts.errorMessage;
    this.ambiguous = opts.ambiguous ?? false;
  }
}

export function isGreenInvoiceError(e: unknown): e is GreenInvoiceError {
  return e instanceof GreenInvoiceError;
}

/** טקסט חלופי לקודים נפוצים כש-errorMessage ריק */
const FALLBACK_MESSAGES: Record<number, string> = {
  401: "הגישה ל-Green Invoice נדחתה — בדקו את מפתח ה-API",
  404: "הנתיב לא נמצא ב-Green Invoice",
  1006: "יש לחדש את המנוי ב-Green Invoice",
  1007: "למשתמש אין הרשאה לפעולה זו ב-Green Invoice",
  1010: "בקשה זהה כבר נשלחה ל-Green Invoice (נמנעה הפקה כפולה)",
  1012: "הפעולה דורשת מסלול מנוי גבוה יותר ב-Green Invoice",
  1015: "יש להסדיר חוב פתוח ב-Green Invoice",
  1112: "הגעתם למכסת המסמכים החודשית ב-Green Invoice",
  2405: "תאריך המסמך עתידי או מוקדם מהמסמך האחרון מסוג זה",
  2411: "הלקוח לא קיים ב-Green Invoice",
  2413: "יש להזין לפחות שורת הכנסה אחת",
  2419: "יש להזין לפחות שורת תשלום אחת",
  2422: "סכום התשלומים אינו תואם לסכום המסמך",
  2426: "תאריך תשלום ריק, עתידי או לא תקין",
  2429: "המסמך המקושר לא נמצא ב-Green Invoice",
  2700: "מפתח ה-API אינו תקין",
  3303: "יש לצרף קובץ להוצאה",
  3310: "חודש דיווח לא תקין",
  3311: "חסרים פרטי ספק",
  3312: "יש לבחור סיווג הנהלת חשבונות להוצאה",
  3314: "לא ניתן לעדכן הוצאה שכבר דווחה",
};

const OAUTH_MESSAGES: Record<string, string> = {
  invalid_request: "בקשת ההתחברות ל-Green Invoice אינה תקינה",
  unsupported_grant_type: "סוג ההתחברות אינו נתמך ב-Green Invoice",
  invalid_grant: "מפתח ה-API פג תוקף, בוטל או עדיין ממתין לאישור ב-Green Invoice",
  unauthorized_client: "אין מנוי פעיל עם גישת API בחשבון Green Invoice",
  invalid_client: "מזהה או סוד מפתח ה-API שגויים (או שהחשבון חסום)",
};

export function fallbackMessageFor(code: number | string | null, status: number | null): string {
  if (typeof code === "string" && OAUTH_MESSAGES[code]) return OAUTH_MESSAGES[code];
  if (typeof code === "number" && FALLBACK_MESSAGES[code]) return FALLBACK_MESSAGES[code];
  if (status === 429) return "יותר מדי בקשות ל-Green Invoice — נסו שוב בעוד רגע";
  if (status && status >= 500) return "שגיאת שרת ב-Green Invoice — נסו שוב מאוחר יותר";
  return "Green Invoice החזיר שגיאה";
}

/** בונה GreenInvoiceError מתשובת HTTP שנכשלה (גוף JSON או טקסט) */
export function errorFromResponse(
  status: number,
  body: unknown,
  opts: { ambiguous?: boolean } = {}
): GreenInvoiceError {
  let code: number | string | null = null;
  let msg = "";
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.errorCode === "number" || typeof b.errorCode === "string") {
      code = typeof b.errorCode === "string" && /^\d+$/.test(b.errorCode) ? Number(b.errorCode) : b.errorCode;
    }
    if (typeof b.errorMessage === "string") msg = b.errorMessage.trim();
    // OAuth2 (נקודת הטוקן): { error, error_description }
    if (code === null && typeof b.error === "string") code = b.error;
    if (!msg && typeof b.error === "string" && OAUTH_MESSAGES[b.error]) msg = OAUTH_MESSAGES[b.error];
  }
  const fallback = fallbackMessageFor(code, status);
  const text = msg || fallback;
  const withCode = code !== null && code !== status ? `${text} (קוד ${code})` : text;
  return new GreenInvoiceError({
    kind: status === 401 || status === 403 ? "auth" : status === 429 ? "rate_limited" : "http",
    status,
    errorCode: code,
    errorMessage: withCode,
    ambiguous: opts.ambiguous ?? false,
  });
}

export const NOT_CONFIGURED_MESSAGE =
  "Green Invoice לא מחובר — יש להגדיר מפתח API (הגדרות ← Green Invoice)";
