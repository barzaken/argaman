import "server-only";

import { getPresignedUpload, giRequest, uploadToPresigned } from "@/lib/green-invoice/client";
import {
  buildClientRequest,
  buildSupplierRequest,
  normalizeClassifications,
  normalizeTaxId,
  pickClientMatch,
  type CrmCustomer,
  type CrmSupplierForGi,
  type GiAccountingClassification,
  type GiDocumentRequest,
  type GiExpenseRequest,
} from "@/lib/green-invoice/mappers";

/** פעולות ברמה גבוהה מול Morning (בלי DB). */

export type GiCreatedDocument = {
  id: string;
  number: number | string;
  type: number;
  url?: { origin?: string; he?: string; en?: string };
  dueDate?: string;
  vatRate?: number;
};

export type GiSearchPage<T> = { total?: number; items?: T[] };

type GiClientItem = { id?: string; name?: string; taxId?: string | null; active?: boolean };

// מטמון מזהי לקוחות / ספקים לכל מופע שרת (חוסך חיפוש בכל הפקה)
const clientIdCache = new Map<string, string>();

export function documentUrl(doc: { url?: { origin?: string; he?: string; en?: string } } | null | undefined): string | null {
  return doc?.url?.he || doc?.url?.origin || doc?.url?.en || null;
}

/** מוצא לקוח לפי שם + ח.פ (אין מסנן taxId בחיפוש לקוחות); null כשאין */
export async function findClientId(crmCustomerId: string, c: CrmCustomer): Promise<string | null> {
  const cacheKey = `${crmCustomerId}|${normalizeTaxId(c.tax_id)}|${c.name.trim()}`;
  const cached = clientIdCache.get(cacheKey);
  if (cached) return cached;
  const res = await giRequest<GiSearchPage<GiClientItem>>("POST", "/clients/search", {
    body: { name: c.name.trim(), page: 1, pageSize: 100 },
  });
  const id = pickClientMatch(res?.items ?? [], c);
  if (id) clientIdCache.set(cacheKey, id);
  return id;
}

/** מוצא או יוצר לקוח (POST /clients). מחזיר { id, created } */
export async function findOrCreateClient(
  crmCustomerId: string,
  c: CrmCustomer
): Promise<{ id: string; created: boolean }> {
  const found = await findClientId(crmCustomerId, c);
  if (found) return { id: found, created: false };
  const created = await giRequest<{ id?: string }>("POST", "/clients", {
    body: buildClientRequest(c, crmCustomerId),
  });
  if (!created?.id) throw new Error("Green Invoice לא החזיר מזהה לקוח");
  clientIdCache.set(`${crmCustomerId}|${normalizeTaxId(c.tax_id)}|${c.name.trim()}`, created.id);
  return { id: created.id, created: true };
}

export async function previewDocument(payload: GiDocumentRequest): Promise<string> {
  const res = await giRequest<{ file?: string }>("POST", "/documents/preview", {
    body: payload,
    timeoutMs: 45_000,
  });
  if (!res?.file) throw new Error("Green Invoice לא החזיר קובץ תצוגה מקדימה");
  return res.file;
}

export async function createDocument(payload: GiDocumentRequest): Promise<GiCreatedDocument> {
  const res = await giRequest<GiCreatedDocument>("POST", "/documents", {
    body: payload,
    timeoutMs: 45_000,
  });
  if (!res?.id) throw new Error("Green Invoice לא החזיר מזהה מסמך");
  return res;
}

export async function getDocument(id: string): Promise<GiCreatedDocument & { status?: number; amount?: number }> {
  return giRequest("GET", `/documents/${encodeURIComponent(id)}`);
}

/**
 * חיפוש מסמכים שאולי הופקו בבקשה שלא קיבלה תשובה (התאוששות מנעילה תקועה).
 * מחפש לפי סוג + תיאור (description ייחודי לתעודה/תשלום) מיום לפני הנעילה. מחזיר את כל המועמדים.
 */
export async function findRecentDocuments(opts: {
  type: number;
  description: string;
  fromDate: string;
  /** כשתוצאות החיפוש לא כוללות description — משווים לסכום המסמך */
  expectedAmount: number;
}): Promise<GiCreatedDocument[]> {
  const res = await giRequest<GiSearchPage<GiCreatedDocument & { description?: string; amount?: number }>>(
    "POST",
    "/documents/search",
    { body: { type: [opts.type], description: opts.description, fromDate: opts.fromDate, page: 1, pageSize: 50 } }
  );
  return (res?.items ?? []).filter(
    (d) =>
      d.id &&
      (d.description
        ? d.description === opts.description
        : typeof d.amount === "number" && Math.abs(d.amount - opts.expectedAmount) < 0.01)
  );
}

export type GiDocumentInfo = {
  number?: number;
  vatRate?: number;
  lastDocumentDate?: string;
  today?: string;
  paymentRowsEnabled?: boolean;
  incomeRowsRequired?: boolean;
};

export async function getDocumentInfo(type: number): Promise<GiDocumentInfo> {
  return giRequest("GET", "/documents/info", { query: { type } });
}

/** GET /businesses/me — קיים אך לא מתועד ב-spec; null בכל כישלון */
export async function getBusinessName(): Promise<string | null> {
  try {
    const b = await giRequest<{ name?: string; title?: string }>("GET", "/businesses/me", { timeoutMs: 10_000 });
    return (b?.name || b?.title || "").trim() || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// ספקים, הוצאות, סיווגים
// ---------------------------------------------------------------------------
export async function findOrCreateSupplier(s: CrmSupplierForGi): Promise<{ id: string; created: boolean }> {
  if (s.green_invoice_supplier_id) return { id: s.green_invoice_supplier_id, created: false };
  const req = buildSupplierRequest(s);
  if (req.taxId) {
    const res = await giRequest<GiSearchPage<{ id?: string; taxId?: string; name?: string }>>(
      "POST",
      "/suppliers/search",
      { body: { taxId: req.taxId, page: 1, pageSize: 25 } }
    );
    const hit = (res?.items ?? []).find((i) => i.id && normalizeTaxId(i.taxId) === normalizeTaxId(req.taxId));
    if (hit?.id) return { id: hit.id, created: false };
  } else {
    const res = await giRequest<GiSearchPage<{ id?: string; taxId?: string; name?: string }>>(
      "POST",
      "/suppliers/search",
      { body: { name: req.name, page: 1, pageSize: 25 } }
    );
    const hits = (res?.items ?? []).filter((i) => i.id && (i.name ?? "").trim() === req.name);
    if (hits.length === 1) return { id: hits[0].id!, created: false };
  }
  const created = await giRequest<{ id?: string }>("POST", "/suppliers", { body: req });
  if (!created?.id) throw new Error("Green Invoice לא החזיר מזהה ספק");
  return { id: created.id, created: true };
}

export async function createExpense(payload: GiExpenseRequest): Promise<{ id: string; status?: number }> {
  const res = await giRequest<{ id?: string; status?: number }>("POST", "/expenses", { body: payload, timeoutMs: 30_000 });
  if (!res?.id) throw new Error("Green Invoice לא החזיר מזהה הוצאה");
  return { id: res.id, status: res.status };
}

const CLASSIFICATIONS_TTL_MS = 6 * 60 * 60 * 1000;
let classificationsCache: { at: number; items: GiAccountingClassification[] } | null = null;

/**
 * GET /accounting/classifications/map (לא מתועד ב-spec; הנתיב קיים).
 * גיבוי: סיווגים שמופיעים בהוצאות קיימות (POST /expenses/search — מתועד).
 */
export async function listClassifications(opts: { force?: boolean } = {}): Promise<GiAccountingClassification[]> {
  if (!opts.force && classificationsCache && Date.now() - classificationsCache.at < CLASSIFICATIONS_TTL_MS) {
    return classificationsCache.items;
  }
  let items: GiAccountingClassification[] = [];
  let firstError: unknown = null;
  try {
    items = normalizeClassifications(await giRequest<unknown>("GET", "/accounting/classifications/map"));
  } catch (e) {
    firstError = e;
  }
  if (!items.length) {
    try {
      const res = await giRequest<GiSearchPage<{ accountingClassification?: unknown }>>("POST", "/expenses/search", {
        body: { page: 1, pageSize: 100 },
      });
      items = normalizeClassifications((res?.items ?? []).map((x) => x.accountingClassification));
    } catch (e) {
      if (!firstError) firstError = e;
    }
  }
  if (!items.length && firstError) throw firstError;
  classificationsCache = { at: Date.now(), items };
  return items;
}

/** מצרף קובץ להוצאה קיימת (שני שלבים, presigned S3) */
export async function attachFileToExpense(expenseId: string, file: Blob, fileName: string): Promise<void> {
  const presigned = await getPresignedUpload("expense", { id: expenseId, source: 5, state: "expense" });
  await uploadToPresigned(presigned, file, fileName);
}

/** התאוששות מנעילה תקועה בהוצאה: חיפוש לפי מספר מסמך + ספק */
export async function findRecentExpenses(opts: {
  number: string;
  supplierId?: string | null;
}): Promise<{ id: string; number?: string; status?: number }[]> {
  const body: Record<string, unknown> = { number: opts.number, page: 1, pageSize: 20 };
  if (opts.supplierId) body.supplierId = opts.supplierId;
  const res = await giRequest<GiSearchPage<{ id?: string; number?: string; status?: number }>>(
    "POST",
    "/expenses/search",
    { body }
  );
  return (res?.items ?? [])
    .filter((x): x is { id: string; number?: string; status?: number } => !!x.id && (x.number ?? opts.number) === opts.number)
    .filter((x) => x.status !== 100);
}
