import "server-only";

import { headers } from "next/headers";

/**
 * כתובת הבסיס לקישורים ציבוריים (אישור נוסח). MEM_PUBLIC_BASE_URL גובר
 * (למשל https://crm.argmn.co.il); אחרת — הדומיין שממנו נפתח ה-CRM.
 */
export async function publicBaseUrl(): Promise<string> {
  const env = process.env.MEM_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "crm.argmn.co.il";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
