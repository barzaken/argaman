import "server-only";

import {
  getGreenInvoiceConfig,
  type GreenInvoiceConfig,
} from "@/lib/green-invoice/config";
import {
  GreenInvoiceError,
  NOT_CONFIGURED_MESSAGE,
  errorFromResponse,
} from "@/lib/green-invoice/errors";

/**
 * לקוח HTTP ל-Green Invoice (Morning) — צד שרת בלבד.
 *
 * - טוקן OAuth2 client-credentials (POST /idp/v1/oauth/token → { accessToken, tokenType, expiresAt })
 *   נשמר בזיכרון ומתחדש 5 דקות לפני שפג (תוקף: שעה).
 * - 401 → חידוש טוקן וניסיון חוזר אחד.
 * - עד 3 בקשות בשנייה לכל מופע שרת; 429 → המתנה (Retry-After / backoff) ועד 3 ניסיונות.
 * - timeout לכל בקשה. POST שנכשל ב-timeout / ניתוק / 5xx מסומן ambiguous ולא נשלח שוב.
 */

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_REQUESTS_PER_SECOND = 3;
const MAX_429_RETRIES = 3;

type CachedToken = { cacheKey: string; token: string; expiresAtMs: number };
let cachedToken: CachedToken | null = null;
let inflightToken: Promise<CachedToken> | null = null;

// ---------------------------------------------------------------------------
// throttle: לכל היותר 3 התחלות בקשה בכל חלון של שנייה
// ---------------------------------------------------------------------------
const recentStarts: number[] = [];
let throttleChain: Promise<void> = Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function throttle(): Promise<void> {
  const next = throttleChain.then(async () => {
    for (;;) {
      const now = Date.now();
      while (recentStarts.length && now - recentStarts[0] >= 1000) recentStarts.shift();
      if (recentStarts.length < MAX_REQUESTS_PER_SECOND) {
        recentStarts.push(now);
        return;
      }
      await sleep(1000 - (now - recentStarts[0]) + 5);
    }
  });
  throttleChain = next.catch(() => undefined);
  return next;
}

function retryAfterMs(res: Response, attempt: number): number {
  const h = res.headers.get("retry-after");
  const secs = h ? Number(h) : NaN;
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 10_000);
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { errorMessage: "", raw: text.slice(0, 300) };
  }
}

function networkError(e: unknown, ambiguous: boolean): GreenInvoiceError {
  const name = (e as { name?: string })?.name;
  const isTimeout = name === "TimeoutError" || name === "AbortError";
  return new GreenInvoiceError({
    kind: isTimeout ? "timeout" : "network",
    errorMessage: isTimeout
      ? "Green Invoice לא הגיב בזמן"
      : "אין תקשורת עם Green Invoice",
    ambiguous,
  });
}

export function requireConfig(): GreenInvoiceConfig {
  const cfg = getGreenInvoiceConfig();
  if (!cfg) {
    throw new GreenInvoiceError({ kind: "not_configured", errorMessage: NOT_CONFIGURED_MESSAGE });
  }
  return cfg;
}

// ---------------------------------------------------------------------------
// token
// ---------------------------------------------------------------------------
async function fetchToken(cfg: GreenInvoiceConfig): Promise<CachedToken> {
  await throttle();
  let res: Response;
  try {
    res = await fetch(cfg.authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: cfg.keyId,
        client_secret: cfg.keySecret,
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    throw networkError(e, false);
  }
  const body = await readJson(res);
  if (!res.ok) {
    const err = errorFromResponse(res.status, body);
    throw new GreenInvoiceError({
      kind: "auth",
      status: err.status,
      errorCode: err.errorCode,
      errorMessage: `ההתחברות ל-Green Invoice נכשלה: ${err.errorMessage}`,
    });
  }
  const b = (body ?? {}) as { accessToken?: unknown; expiresAt?: unknown };
  if (typeof b.accessToken !== "string" || !b.accessToken) {
    throw new GreenInvoiceError({
      kind: "invalid_response",
      status: res.status,
      errorMessage: "Green Invoice החזיר תשובת התחברות לא צפויה (אין accessToken)",
    });
  }
  // expiresAt בשניות (unix). אם חסר — שעה מעכשיו.
  const expSec = typeof b.expiresAt === "number" ? b.expiresAt : Number(b.expiresAt);
  const expiresAtMs = Number.isFinite(expSec) && expSec > 0 ? expSec * 1000 : Date.now() + 3600_000;
  return { cacheKey: `${cfg.authUrl}|${cfg.keyId}`, token: b.accessToken, expiresAtMs };
}

export async function getAccessToken(opts: { force?: boolean } = {}): Promise<string> {
  const cfg = requireConfig();
  const key = `${cfg.authUrl}|${cfg.keyId}`;
  if (
    !opts.force &&
    cachedToken &&
    cachedToken.cacheKey === key &&
    Date.now() < cachedToken.expiresAtMs - TOKEN_REFRESH_MARGIN_MS
  ) {
    return cachedToken.token;
  }
  if (!inflightToken) {
    inflightToken = fetchToken(cfg)
      .then((t) => {
        cachedToken = t;
        return t;
      })
      .finally(() => {
        inflightToken = null;
      });
  }
  return (await inflightToken).token;
}

/** למבחנים / לאחר שינוי מפתח */
export function clearTokenCache() {
  cachedToken = null;
}

// ---------------------------------------------------------------------------
// requests
// ---------------------------------------------------------------------------
export type GiRequestOptions = {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
  /** כתובת מלאה במקום apiUrl + path (לשירות העלאת הקבצים) */
  absoluteUrl?: string;
};

export async function giRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  opts: GiRequestOptions = {}
): Promise<T> {
  const cfg = requireConfig();
  const base = opts.absoluteUrl ?? `${cfg.apiUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const url = new URL(base);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const isRead = method === "GET";
  let refreshed = false;
  let attempt429 = 0;
  let readRetried = false;

  for (;;) {
    const token = await getAccessToken({ force: false });
    await throttle();
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (e) {
      if (isRead && !readRetried) {
        readRetried = true;
        await sleep(500);
        continue;
      }
      throw networkError(e, !isRead);
    }

    if (res.status === 401 && !refreshed) {
      refreshed = true;
      await res.text().catch(() => "");
      clearTokenCache();
      await getAccessToken({ force: true });
      continue;
    }
    if (res.status === 429 && attempt429 < MAX_429_RETRIES) {
      const wait = retryAfterMs(res, attempt429);
      attempt429++;
      await res.text().catch(() => "");
      await sleep(wait);
      continue;
    }
    if (res.status >= 500 && isRead && !readRetried) {
      readRetried = true;
      await res.text().catch(() => "");
      await sleep(700);
      continue;
    }

    const body = await readJson(res);
    if (!res.ok) {
      throw errorFromResponse(res.status, body, { ambiguous: !isRead && res.status >= 500 });
    }
    return body as T;
  }
}

// ---------------------------------------------------------------------------
// העלאת קובץ (presigned S3): שלב 1 — קבלת URL, שלב 2 — multipart POST
// ---------------------------------------------------------------------------
export type PresignedUpload = {
  url: string;
  fields: Record<string, string>;
  maxFileSize?: number;
};

export async function getPresignedUpload(
  context: "expense",
  data: Record<string, unknown>
): Promise<PresignedUpload> {
  const cfg = requireConfig();
  const res = await giRequest<PresignedUpload>("GET", "", {
    absoluteUrl: cfg.uploadUrl,
    query: { context, data: JSON.stringify(data) },
  });
  if (!res || typeof res.url !== "string" || !res.fields || typeof res.fields !== "object") {
    throw new GreenInvoiceError({
      kind: "invalid_response",
      errorMessage: "שירות העלאת הקבצים של Green Invoice החזיר תשובה לא צפויה",
    });
  }
  return res;
}

/** שלב 2 — בתוך 60 שניות משלב 1. כל השדות כמו שהם, והקובץ אחרון. ללא Authorization. */
export async function uploadToPresigned(
  presigned: PresignedUpload,
  file: Blob,
  fileName: string
): Promise<void> {
  if (presigned.maxFileSize && file.size > presigned.maxFileSize) {
    throw new GreenInvoiceError({
      kind: "http",
      errorMessage: `הקובץ גדול מהמותר ב-Green Invoice (${Math.round(presigned.maxFileSize / 1024 / 1024)}MB)`,
    });
  }
  const form = new FormData();
  for (const [k, v] of Object.entries(presigned.fields)) form.append(k, String(v));
  form.append("file", file, fileName);
  await throttle();
  let res: Response;
  try {
    res = await fetch(presigned.url, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
  } catch (e) {
    throw networkError(e, true);
  }
  if (!res.ok) {
    await res.text().catch(() => "");
    throw new GreenInvoiceError({
      kind: "http",
      status: res.status,
      errorMessage: `העלאת הקובץ ל-Green Invoice נכשלה (HTTP ${res.status})`,
    });
  }
  await res.text().catch(() => "");
}
