/**
 * הגדרות חיבור ל-Green Invoice (Morning) — נקרא רק בצד השרת.
 *
 * משתני סביבה (ראו .env.example):
 * - GREEN_INVOICE_API_KEY_ID / GREEN_INVOICE_API_KEY_SECRET — מפתח API (client credentials)
 * - GREEN_INVOICE_ENV — 'sandbox' (ברירת מחדל) או 'production'. סביבת ייצור רק כשמוגדר במפורש.
 * - GREEN_INVOICE_API_URL / GREEN_INVOICE_AUTH_URL / GREEN_INVOICE_UPLOAD_URL — דריסות (לבדיקות / שרת מדומה)
 *
 * הקובץ לא מייבא "server-only" כדי שאפשר יהיה לבדוק אותו מסקריפט node,
 * אבל אין בו סודות שנחשפים — הסודות נקראים רק ב-client.ts.
 */

export type GreenInvoiceEnv = "production" | "sandbox";

export const GREEN_INVOICE_HOSTS: Record<
  GreenInvoiceEnv,
  { api: string; auth: string; upload: string; app: string }
> = {
  production: {
    api: "https://api.greeninvoice.co.il/api/v1",
    auth: "https://api.morning.co/idp/v1/oauth/token",
    upload: "https://api.morning.co/file-upload/v1/url",
    app: "https://app.greeninvoice.co.il",
  },
  sandbox: {
    api: "https://sandbox.d.greeninvoice.co.il/api/v1",
    auth: "https://api.sandbox.morning.dev/idp/v1/oauth/token",
    // לפי ה-spec הרשמי; ייתכן שחסום מרשתות מסוימות — אפשר לדרוס עם GREEN_INVOICE_UPLOAD_URL
    // (חלופה שעונה כמו ייצור: https://api.sandbox.morning.dev/file-upload/v1/url)
    upload: "https://api.sandbox.d.greeninvoice.co.il/file-upload/v1/url",
    app: "https://sandbox.d.greeninvoice.co.il",
  },
};

export type GreenInvoiceConfig = {
  env: GreenInvoiceEnv;
  keyId: string;
  keySecret: string;
  apiUrl: string;
  authUrl: string;
  uploadUrl: string;
  appUrl: string;
};

type EnvLike = Record<string, string | undefined>;

function clean(v: string | undefined): string {
  return (v ?? "").trim();
}

export function resolveGreenInvoiceEnv(env: EnvLike = process.env): GreenInvoiceEnv {
  return clean(env.GREEN_INVOICE_ENV).toLowerCase() === "production" ? "production" : "sandbox";
}

/** אילו משתנים חסרים (לתצוגה בכרטיס ההגדרות) */
export function missingGreenInvoiceVars(env: EnvLike = process.env): string[] {
  const missing: string[] = [];
  if (!clean(env.GREEN_INVOICE_API_KEY_ID)) missing.push("GREEN_INVOICE_API_KEY_ID");
  if (!clean(env.GREEN_INVOICE_API_KEY_SECRET)) missing.push("GREEN_INVOICE_API_KEY_SECRET");
  return missing;
}

/** true כשהוגדרו מזהה וסוד של מפתח API */
export function isGreenInvoiceConfigured(env: EnvLike = process.env): boolean {
  return missingGreenInvoiceVars(env).length === 0;
}

/** null כשהחיבור לא מוגדר */
export function getGreenInvoiceConfig(env: EnvLike = process.env): GreenInvoiceConfig | null {
  if (!isGreenInvoiceConfigured(env)) return null;
  const which = resolveGreenInvoiceEnv(env);
  const hosts = GREEN_INVOICE_HOSTS[which];
  const strip = (u: string) => u.replace(/\/+$/, "");
  return {
    env: which,
    keyId: clean(env.GREEN_INVOICE_API_KEY_ID),
    keySecret: clean(env.GREEN_INVOICE_API_KEY_SECRET),
    apiUrl: strip(clean(env.GREEN_INVOICE_API_URL) || hosts.api),
    authUrl: clean(env.GREEN_INVOICE_AUTH_URL) || hosts.auth,
    uploadUrl: clean(env.GREEN_INVOICE_UPLOAD_URL) || hosts.upload,
    appUrl: hosts.app,
  };
}
