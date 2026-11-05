"use server";

import { revalidatePath } from "next/cache";

import { z } from "@/lib/zod-he";
import { toHebrewError } from "@/lib/db/errors";
import type { DocumentViewRow } from "@/lib/db/types";
import { requireAuth } from "@/lib/supabase/auth-helpers";
import { giRequest } from "@/lib/green-invoice/client";
import { isGreenInvoiceConfigured, resolveGreenInvoiceEnv } from "@/lib/green-invoice/config";
import { isGreenInvoiceError, NOT_CONFIGURED_MESSAGE } from "@/lib/green-invoice/errors";
import { cleanEmails, israelToday, type CrmCustomer } from "@/lib/green-invoice/mappers";
import {
  createDocument,
  documentUrl,
  findClientId,
  findOrCreateClient,
  previewDocument,
  type GiCreatedDocument,
} from "@/lib/green-invoice/service";
import { STALE_LOCK_MS } from "@/lib/green-invoice/status";
import {
  canRoleIssue,
  GI_DOC_STATUS_LABELS,
  GI_DOC_TYPE_DEFS,
  GI_DOC_TYPES,
  GI_LIMITS,
  giDocTypeName,
  isGiDocType,
  type GiDocType,
} from "@/lib/green-invoice/document-types";
import {
  buildDocumentPayload,
  type DocFormModel,
  type DocIssue,
  type DocTotals,
  type GiDocumentPayload,
} from "@/lib/green-invoice/document-builder";

// =============================================================================
// טיפוסים
// =============================================================================
export type MorningFailCode =
  | "not_configured"
  | "auth"
  | "forbidden"
  | "invalid"
  | "already_issued"
  | "in_progress"
  | "ambiguous"
  | "gi_error"
  | "db_error";

export type MorningFailure = {
  ok: false;
  code: MorningFailCode;
  message: string;
  issues?: DocIssue[];
  url?: string | null;
  documentId?: string | null;
};
export type MorningResult<T extends object = object> = ({ ok: true; message: string; warning?: string } & T) | MorningFailure;

/** הקשר ה-CRM של המסמך (מאיפה הגיע הטופס) */
export type MorningIssueContext = {
  customerId?: string | null;
  supplierId?: string | null;
  orderId?: string | null;
  deliveryId?: string | null;
  paymentId?: string | null;
  quoteId?: string | null;
  /** הערה פנימית לשורה בארכיון ("תעודת משלוח 1001") */
  note?: string | null;
};

export type MorningDocumentInfo = {
  type: number;
  number: number | null;
  vatRate: number | null;
  lastDocumentDate: string | null;
  today: string | null;
  incomeRowsEnabled: boolean | null;
  incomeRowsRequired: boolean | null;
  paymentRowsEnabled: boolean | null;
  selfInvoiceEnabled: boolean | null;
  vatTypes: number[] | null;
  receiptIncomeEnabled: boolean | null;
  paymentPlugins: { id: string; name: string; type: number | null }[];
};

export type MorningSearchItem = {
  id: string;
  type: number;
  typeName: string;
  number: string;
  documentDate: string | null;
  status: number | null;
  statusLabel: string | null;
  amount: number | null;
  currency: string | null;
  clientName: string | null;
  description: string | null;
  url: string | null;
  /** המסמך קיים בארכיון שלנו */
  localDocumentId: string | null;
};

export type IssuedMorningDocument = {
  greenInvoiceId: string;
  type: number;
  typeName: string;
  number: string;
  url: string | null;
  documentId: string | null;
  linkedCount: number;
};

type Supa = Extract<Awaited<ReturnType<typeof requireAuth>>, { ok: true }>["supabase"];

// =============================================================================
// עזרים
// =============================================================================
const uuid = z.string().uuid();
const optUuid = z.string().uuid().nullable().optional();

const contextSchema = z
  .object({
    customerId: optUuid,
    supplierId: optUuid,
    orderId: optUuid,
    deliveryId: optUuid,
    paymentId: optUuid,
    quoteId: optUuid,
    note: z.string().max(300).nullable().optional(),
  })
  .default({});

const numLike = z.union([z.number(), z.string().max(40), z.null()]).optional();
const str = (max: number) => z.string().max(max).optional();

/** בדיקת מבנה בסיסית — הכללים העסקיים ב-validateDocumentModel */
const modelSchema = z.object({
  type: z.number().int().refine((t) => isGiDocType(t), "סוג מסמך לא נתמך"),
  date: str(10),
  dueDate: str(10),
  lang: z.enum(["he", "en"]),
  currency: z.string().length(3),
  currencyRate: numLike,
  vatType: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  discount: z.object({ amount: numLike, type: z.enum(["sum", "percentage"]) }).nullable().optional(),
  rounding: z.boolean().optional(),
  signed: z.boolean().optional(),
  attachment: z.boolean().optional(),
  description: str(500),
  remarks: str(2000),
  footer: str(2000),
  emailContent: str(2000),
  client: z.object({
    id: z.string().max(80).nullable().optional(),
    name: z.string().max(200),
    taxId: str(30),
    emails: z.array(z.string().max(200)).max(10).optional(),
    address: str(300),
    city: str(100),
    zip: str(20),
    country: str(2),
    phone: str(40),
    fax: str(40),
    mobile: str(40),
    add: z.boolean().optional(),
    self: z.boolean().optional(),
  }),
  income: z
    .array(
      z.object({
        description: z.string().max(1000),
        quantity: numLike,
        price: numLike,
        vatType: z.union([z.literal(0), z.literal(1), z.literal(2)]),
        vatRate: numLike,
        catalogNum: str(100),
        itemId: str(80),
        currency: str(3),
        currencyRate: numLike,
      })
    )
    .max(GI_LIMITS.maxRows, "עד 200 שורות הכנסה"),
  payment: z
    .array(
      z.object({
        type: z.number().int(),
        date: z.string().max(10),
        price: numLike,
        currency: str(3),
        currencyRate: numLike,
        chequeNum: str(40),
        bankName: str(80),
        bankBranch: str(20),
        bankAccount: str(40),
        cardType: numLike,
        cardNum: str(10),
        dealType: numLike,
        numPayments: numLike,
        firstPayment: numLike,
        accountId: str(120),
        transactionId: str(120),
        appType: numLike,
        subType: numLike,
      })
    )
    .max(GI_LIMITS.maxRows, "עד 200 שורות תקבול"),
  linkedDocumentIds: z.array(z.string().max(80)).max(50).optional(),
  linkType: z.enum(["link", "cancel", "copy", ""]).nullable().optional(),
  linkedPaymentId: str(80),
  paymentRequest: z
    .object({
      enabled: z.boolean(),
      plugins: z.array(z.object({ id: z.string().max(80), group: z.number().optional(), type: z.number().optional() })).max(10),
      maxPayments: numLike,
    })
    .nullable()
    .optional(),
});

function notConfigured(): MorningFailure {
  return { ok: false, code: "not_configured", message: NOT_CONFIGURED_MESSAGE };
}

function failFrom(e: unknown, context: string): MorningFailure {
  if (isGreenInvoiceError(e)) {
    if (e.kind === "not_configured") return notConfigured();
    return { ok: false, code: e.ambiguous ? "ambiguous" : "gi_error", message: `${context}: ${e.errorMessage}` };
  }
  console.error(`[green-invoice/documents] ${context}:`, e);
  const msg = e instanceof Error && /[֐-׿]/.test(e.message) ? e.message : "אירעה שגיאה לא צפויה";
  return { ok: false, code: "gi_error", message: `${context}: ${msg}` };
}

function parseModel(raw: unknown): { ok: true; model: DocFormModel } | MorningFailure {
  const p = modelSchema.safeParse(raw);
  if (!p.success) {
    const first = p.error.issues[0];
    return { ok: false, code: "invalid", message: `נתוני הטופס לא תקינים${first ? `: ${first.message}` : ""}` };
  }
  return { ok: true, model: p.data as unknown as DocFormModel };
}

function invalid(issues: DocIssue[]): MorningFailure {
  return {
    ok: false,
    code: "invalid",
    message: issues.length === 1 ? issues[0].message : `יש ${issues.length} שדות לתיקון: ${issues[0].message}`,
    issues,
  };
}

function revalidateAll() {
  for (const p of [
    "/dashboard/green-invoice/documents",
    "/dashboard/documents",
    "/dashboard/deliveries",
    "/dashboard/payments",
    "/dashboard/orders",
    "/dashboard/customers",
    "/dashboard/suppliers",
    "/dashboard",
  ]) {
    revalidatePath(p, "layout");
  }
}

async function loadCustomer(supabase: Supa, id: string): Promise<CrmCustomer | null> {
  const { data } = await supabase.from("customers").select("name, tax_id, email, phone, address").eq("id", id).maybeSingle();
  return (data as CrmCustomer | null) ?? null;
}

async function loadSupplier(supabase: Supa, id: string): Promise<CrmCustomer | null> {
  const { data } = await supabase.from("suppliers").select("name, tax_id, email, phone, address").eq("id", id).maybeSingle();
  return (data as CrmCustomer | null) ?? null;
}

/**
 * הלקוח במסמך:
 * - לקוח CRM → מזהה הלקוח ב-Morning (חיפוש לפי שם + ח.פ; בהפקה — יצירה אם חסר) + המיילים מהטופס.
 *   בתצוגה מקדימה, כשאין עדיין לקוח ב-Morning — פרטים מלאים בלי add.
 * - ספק (הזמנת רכש) → פרטי הספק מה-CRM (הספק אינו "לקוח" ב-Morning; לא נוסף לרשימה).
 * - אד-הוק → מה שהוזן בטופס (+ add לפי הבחירה).
 */
async function resolveClient(
  supabase: Supa,
  model: DocFormModel,
  ctx: MorningIssueContext,
  mode: "preview" | "issue"
): Promise<{ ok: true; model: DocFormModel; counterparty: { name: string; taxId: string | null } } | MorningFailure> {
  const def = GI_DOC_TYPE_DEFS[model.type];
  const emails = model.client.emails ?? [];
  if (def.counterparty === "supplier" && ctx.supplierId) {
    const s = await loadSupplier(supabase, ctx.supplierId);
    if (!s) return { ok: false, code: "invalid", message: "הספק לא נמצא" };
    return {
      ok: true,
      model: {
        ...model,
        client: {
          ...model.client,
          id: null,
          name: s.name,
          taxId: s.tax_id ?? model.client.taxId,
          address: s.address ?? model.client.address,
          phone: s.phone ?? model.client.phone,
          emails: emails.length ? emails : cleanEmails([s.email]),
        },
      },
      counterparty: { name: s.name, taxId: s.tax_id },
    };
  }
  if (ctx.customerId) {
    const c = await loadCustomer(supabase, ctx.customerId);
    if (!c) return { ok: false, code: "invalid", message: "הלקוח לא נמצא" };
    const id =
      mode === "issue" ? (await findOrCreateClient(ctx.customerId, c)).id : await findClientId(ctx.customerId, c);
    const client = id
      ? { ...model.client, id, name: c.name }
      : {
          ...model.client,
          id: null,
          name: c.name,
          taxId: c.tax_id ?? undefined,
          address: c.address ?? undefined,
          phone: c.phone ?? undefined,
          add: false,
        };
    return { ok: true, model: { ...model, client }, counterparty: { name: c.name, taxId: c.tax_id } };
  }
  return {
    ok: true,
    model: { ...model, client: { ...model.client, id: null } },
    counterparty: { name: model.client.name.trim(), taxId: model.client.taxId?.trim() || null },
  };
}

async function fetchInfo(type: GiDocType): Promise<MorningDocumentInfo | null> {
  try {
    const r = await giRequest<Record<string, unknown>>("GET", "/documents/info", { query: { type } });
    const settings = (r?.settings ?? {}) as Record<string, unknown>;
    const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
    const plugins = Array.isArray(r?.paymentPlugins) ? (r.paymentPlugins as Record<string, unknown>[]) : [];
    return {
      type,
      number: typeof r?.number === "number" ? r.number : null,
      vatRate: typeof r?.vatRate === "number" ? r.vatRate : null,
      lastDocumentDate: typeof r?.lastDocumentDate === "string" ? r.lastDocumentDate : null,
      today: typeof r?.today === "string" ? r.today : null,
      incomeRowsEnabled: bool(r?.incomeRowsEnabled),
      incomeRowsRequired: bool(r?.incomeRowsRequired),
      paymentRowsEnabled: bool(r?.paymentRowsEnabled),
      selfInvoiceEnabled: bool(r?.selfInvoiceEnabled),
      vatTypes: Array.isArray(r?.vatTypes) ? (r.vatTypes as number[]) : null,
      receiptIncomeEnabled: bool(settings.receiptIncomeEnabled),
      paymentPlugins: plugins
        .filter((p) => typeof p.id === "string" && p.active !== false)
        .map((p) => ({
          id: String(p.id),
          name: String(p.friendlyName ?? p.description ?? p.id),
          type: typeof p.type === "number" ? p.type : null,
        })),
    };
  } catch (e) {
    console.error("[green-invoice/documents] info failed:", e);
    return null;
  }
}

// =============================================================================
// מידע על סוג מסמך (מספר הבא, מע״מ, תאריך אחרון, ערוצי תשלום)
// =============================================================================
export async function getMorningDocumentInfo(type: number): Promise<MorningResult<{ info: MorningDocumentInfo }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, code: "auth", message: auth.message };
  if (!isGreenInvoiceConfigured()) return notConfigured();
  if (!isGiDocType(type)) return { ok: false, code: "invalid", message: "סוג מסמך לא נתמך" };
  const info = await fetchInfo(type);
  if (!info) return { ok: false, code: "gi_error", message: "טעינת פרטי סוג המסמך מ-Morning נכשלה" };
  return { ok: true, message: "", info };
}

// =============================================================================
// תצוגה מקדימה
// =============================================================================
export async function previewMorningDocument(
  rawModel: unknown,
  rawCtx: MorningIssueContext = {}
): Promise<MorningResult<{ pdfBase64: string; totals: DocTotals }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, code: "auth", message: auth.message };
  if (!isGreenInvoiceConfigured()) return notConfigured();
  const parsed = parseModel(rawModel);
  if (!parsed.ok) return parsed;
  const ctx = contextSchema.safeParse(rawCtx);
  if (!ctx.success) return { ok: false, code: "invalid", message: "הקשר לא תקין" };
  const info = await fetchInfo(parsed.model.type);
  try {
    const client = await resolveClient(auth.supabase, parsed.model, ctx.data, "preview");
    if (!client.ok) return client;
    const built = buildDocumentPayload(client.model, {
      today: israelToday(),
      vatRate: info?.vatRate ?? undefined,
      lastDocumentDate: info?.lastDocumentDate,
      role: auth.role,
      forPreview: true,
    });
    if (!built.ok) return invalid(built.issues);
    const pdfBase64 = await previewDocument(built.payload as never);
    return { ok: true, message: "", pdfBase64, totals: built.totals };
  } catch (e) {
    return failFrom(e, "התצוגה המקדימה נכשלה");
  }
}

// =============================================================================
// הפקה
// =============================================================================
type LockRow = {
  id: string;
  status: "pending" | "issued" | "failed";
  green_invoice_id: string | null;
  document_id: string | null;
  lock_token: string | null;
  locked_at: string;
};

const issueSchema = z.object({
  requestId: uuid,
});

async function existingIssued(supabase: Supa, lock: LockRow): Promise<MorningFailure> {
  let url: string | null = null;
  let number: string | null = null;
  if (lock.document_id) {
    const { data } = await supabase
      .from("documents")
      .select("green_invoice_url, document_number")
      .eq("id", lock.document_id)
      .maybeSingle();
    url = (data as { green_invoice_url: string | null } | null)?.green_invoice_url ?? null;
    number = (data as { document_number: string | null } | null)?.document_number ?? null;
  }
  return {
    ok: false,
    code: "already_issued",
    url,
    documentId: lock.document_id,
    message: `המסמך כבר הופק${number ? ` (מס׳ ${number})` : ""} — לא מפיקים פעמיים`,
  };
}

/** נעילה ישנה: האם המסמך הופק בכל זאת? מחפש ב-Morning לפי סוג + תאריך + סכום + שם לקוח */
async function recoverStale(
  supabase: Supa,
  opts: { type: GiDocType; since: string; amount: number; clientName: string }
): Promise<{ kind: "none" } | { kind: "one"; doc: GiCreatedDocument } | { kind: "many" }> {
  const from = israelToday(new Date(new Date(opts.since).getTime() - 24 * 3600 * 1000));
  const res = await giRequest<{ items?: (GiCreatedDocument & { amount?: number; client?: { name?: string } })[] }>(
    "POST",
    "/documents/search",
    { body: { type: [opts.type], fromDate: from, page: 1, pageSize: 50 } }
  );
  const items = (res?.items ?? []).filter(
    (d) =>
      d.id &&
      typeof d.amount === "number" &&
      Math.abs(d.amount - opts.amount) < 0.01 &&
      (!d.client?.name || !opts.clientName || d.client.name.trim() === opts.clientName.trim())
  );
  if (!items.length) return { kind: "none" };
  const { data } = await supabase.from("documents").select("green_invoice_id").in("green_invoice_id", items.map((i) => i.id));
  const known = new Set(((data ?? []) as { green_invoice_id: string }[]).map((r) => r.green_invoice_id));
  const unknown = items.filter((i) => !known.has(i.id));
  if (!unknown.length) return { kind: "none" };
  if (unknown.length === 1) return { kind: "one", doc: unknown[0] };
  return { kind: "many" };
}

const newToken = () => crypto.randomUUID();

/** תופס את הנעילה (gi_issue_requests). מחזיר token או כישלון / מסמך שאומץ */
async function claimLock(
  supabase: Supa,
  requestId: string,
  meta: { type: GiDocType; description: string | null; clientName: string; amount: number }
): Promise<{ ok: true; token: string } | { ok: true; adopted: GiCreatedDocument; token: string } | MorningFailure> {
  const token = newToken();
  const { error } = await supabase.from("gi_issue_requests").insert({
    id: requestId,
    doc_type: meta.type,
    status: "pending",
    description: meta.description,
    client_name: meta.clientName,
    amount: meta.amount,
    lock_token: token,
  });
  if (!error) return { ok: true, token };
  if (error.code !== "23505") return { ok: false, code: "db_error", message: toHebrewError(error) };

  const { data, error: selErr } = await supabase
    .from("gi_issue_requests")
    .select("id, status, green_invoice_id, document_id, lock_token, locked_at")
    .eq("id", requestId)
    .maybeSingle();
  if (selErr || !data) return { ok: false, code: "db_error", message: selErr ? toHebrewError(selErr) : "הנעילה לא נמצאה" };
  const lock = data as LockRow;
  if (lock.status === "issued") return existingIssued(supabase, lock);
  const stale = Date.now() - new Date(lock.locked_at).getTime() > STALE_LOCK_MS;
  if (lock.status === "pending" && !stale) {
    return { ok: false, code: "in_progress", message: "הפקת המסמך כבר מתבצעת — המתינו ורעננו את הדף" };
  }
  if (lock.status === "pending") {
    try {
      const r = await recoverStale(supabase, { type: meta.type, since: lock.locked_at, amount: meta.amount, clientName: meta.clientName });
      if (r.kind === "many") {
        return {
          ok: false,
          code: "ambiguous",
          message: "נמצאו ב-Morning כמה מסמכים מתאימים שלא נרשמו במערכת — בדקו שם ידנית לפני הפקה חוזרת",
        };
      }
      if (r.kind === "one") {
        const ok = await swapToken(supabase, requestId, lock.lock_token, token);
        if (!ok) return { ok: false, code: "in_progress", message: "הבקשה עודכנה במקביל — רעננו את הדף" };
        return { ok: true, adopted: r.doc, token };
      }
    } catch (e) {
      return failFrom(e, "בדיקת הפקה קודמת נכשלה");
    }
  }
  const ok = await swapToken(supabase, requestId, lock.lock_token, token, { status: "pending", error: null });
  if (!ok) return { ok: false, code: "in_progress", message: "הבקשה עודכנה במקביל — רעננו את הדף" };
  return { ok: true, token };
}

async function swapToken(
  supabase: Supa,
  requestId: string,
  expected: string | null,
  token: string,
  extra: Record<string, unknown> = {}
): Promise<boolean> {
  let q = supabase
    .from("gi_issue_requests")
    .update({ lock_token: token, locked_at: new Date().toISOString(), ...extra })
    .eq("id", requestId);
  q = expected === null ? q.is("lock_token", null) : q.eq("lock_token", expected);
  const { data, error } = await q.select("id");
  return !error && (data ?? []).length > 0;
}

async function updateLock(supabase: Supa, requestId: string, token: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("gi_issue_requests").update(patch).eq("id", requestId).eq("lock_token", token);
  if (error) console.error("[green-invoice/documents] lock update failed:", error);
}

export async function issueMorningDocument(input: {
  requestId: string;
  model: unknown;
  context?: MorningIssueContext;
}): Promise<MorningResult<{ document: IssuedMorningDocument }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, code: "auth", message: auth.message };
  if (!isGreenInvoiceConfigured()) return notConfigured();
  const req = issueSchema.safeParse({ requestId: input?.requestId });
  if (!req.success) return { ok: false, code: "invalid", message: "מזהה בקשה לא תקין — רעננו את הדף" };
  const parsed = parseModel(input.model);
  if (!parsed.ok) return parsed;
  const ctxParsed = contextSchema.safeParse(input.context ?? {});
  if (!ctxParsed.success) return { ok: false, code: "invalid", message: "הקשר לא תקין" };
  const ctx = ctxParsed.data;
  const supabase = auth.supabase;
  const type = parsed.model.type;
  const def = GI_DOC_TYPE_DEFS[type];

  // הרשאה — בצד השרת, לפני הכל
  if (!canRoleIssue(type, auth.role)) {
    return { ok: false, code: "forbidden", message: `הפקת ${def.name} מותרת למנהל בלבד` };
  }

  const info = await fetchInfo(type);
  const vOpts = {
    today: israelToday(),
    vatRate: info?.vatRate ?? undefined,
    lastDocumentDate: info?.lastDocumentDate,
    role: auth.role,
  } as const;

  // ולידציה לפני נעילה (בלי לקוח Morning)
  const pre = buildDocumentPayload(
    ctx.customerId || ctx.supplierId
      ? { ...parsed.model, client: { ...parsed.model.client, name: parsed.model.client.name || "—" } }
      : parsed.model,
    vOpts
  );
  if (!pre.ok) return invalid(pre.issues);

  const lock = await claimLock(supabase, req.data.requestId, {
    type,
    description: parsed.model.description?.trim() || null,
    clientName: parsed.model.client.name.trim(),
    amount: pre.totals.documentAmount,
  });
  if (!lock.ok) return lock;
  const token = lock.token;

  let payload: GiDocumentPayload;
  let totals: DocTotals;
  let counterparty: { name: string; taxId: string | null };
  try {
    const client = await resolveClient(supabase, parsed.model, ctx, "issue");
    if (!client.ok) {
      await updateLock(supabase, req.data.requestId, token, { status: "failed", error: client.message });
      return client;
    }
    counterparty = client.counterparty;
    const built = buildDocumentPayload(client.model, vOpts);
    if (!built.ok) {
      await updateLock(supabase, req.data.requestId, token, { status: "failed", error: built.issues[0]?.message ?? null });
      return invalid(built.issues);
    }
    payload = built.payload;
    totals = built.totals;
  } catch (e) {
    const f = failFrom(e, "איתור הלקוח ב-Morning נכשל");
    await updateLock(supabase, req.data.requestId, token, { status: "failed", error: f.message });
    return f;
  }

  if ("adopted" in lock) {
    return finalize(supabase, { requestId: req.data.requestId, token, doc: lock.adopted, payload, totals, ctx, counterparty, recovered: true });
  }

  let doc: GiCreatedDocument;
  try {
    doc = await createDocument(payload as never);
  } catch (e) {
    const f = failFrom(e, `הפקת ${def.name} נכשלה`);
    if (f.code === "ambiguous" || !isGreenInvoiceError(e)) {
      // לא ידוע אם הופק — הנעילה נשארת; ניסיון חוזר אחרי 3 דקות יבדוק ב-Morning קודם
      return {
        ok: false,
        code: "ambiguous",
        message: `לא התקבלה תשובה מ-Morning בזמן — ייתכן שהמסמך (${def.name}) הופק בכל זאת. נסו שוב בעוד כ-3 דקות: המערכת תבדוק ב-Morning לפני הפקה חוזרת.`,
      };
    }
    await updateLock(supabase, req.data.requestId, token, { status: "failed", error: f.message });
    return f;
  }
  return finalize(supabase, { requestId: req.data.requestId, token, doc, payload, totals, ctx, counterparty, recovered: false });
}

async function finalize(
  supabase: Supa,
  a: {
    requestId: string;
    token: string;
    doc: GiCreatedDocument;
    payload: GiDocumentPayload;
    totals: DocTotals;
    ctx: MorningIssueContext;
    counterparty: { name: string; taxId: string | null };
    recovered: boolean;
  }
): Promise<MorningResult<{ document: IssuedMorningDocument }>> {
  const { doc, payload, totals, ctx } = a;
  const type = (isGiDocType(Number(doc.type)) ? Number(doc.type) : payload.type) as GiDocType;
  const def = GI_DOC_TYPE_DEFS[type];
  const url = documentUrl(doc);
  const warnings: string[] = [];
  const hasIncome = payload.income.length > 0;
  const env = resolveGreenInvoiceEnv();

  const row = {
    kind: def.crmKind,
    status: "processed",
    source: "green_invoice",
    document_number: String(doc.number),
    document_date: payload.date ?? israelToday(),
    due_date: payload.dueDate ?? null,
    currency: payload.currency,
    amount_before_vat: hasIncome ? totals.beforeVat : totals.documentAmount,
    vat_amount: hasIncome ? totals.vat : 0,
    amount_total: totals.documentAmount,
    counterparty_name: a.counterparty.name || null,
    counterparty_tax_id: a.counterparty.taxId || null,
    customer_id: def.counterparty === "customer" ? (ctx.customerId ?? null) : null,
    supplier_id: def.counterparty === "supplier" ? (ctx.supplierId ?? null) : null,
    order_id: ctx.orderId ?? null,
    delivery_id: ctx.deliveryId ?? null,
    payment_id: ctx.paymentId ?? null,
    green_invoice_id: doc.id,
    green_invoice_type: type,
    green_invoice_url: url,
    notes: ctx.note?.trim() || null,
    extracted: {
      green_invoice: {
        env,
        id: doc.id,
        number: doc.number,
        type,
        url: doc.url ?? null,
        request_id: a.requestId,
        linkedDocumentIds: payload.linkedDocumentIds ?? [],
        linkType: payload.linkType ?? null,
        emailedTo: payload.client.emails ?? [],
        quote_id: ctx.quoteId ?? null,
        recovered: a.recovered,
      },
    },
  };

  let documentId: string | null = null;
  const ins = await supabase.from("documents").insert(row).select("id").single();
  if (ins.error?.code === "23505" && def.crmKind !== "other") {
    // PDF של אותו מסמך כבר הועלה ידנית — מקשרים את השורה הקיימת
    let q = supabase
      .from("documents")
      .select("id")
      .eq("kind", def.crmKind)
      .eq("document_number", String(doc.number))
      .is("green_invoice_id", null)
      .neq("status", "rejected");
    q = row.counterparty_tax_id ? q.eq("counterparty_tax_id", row.counterparty_tax_id) : q.is("counterparty_tax_id", null);
    const { data } = await q.limit(1);
    const existing = (data ?? [])[0] as { id: string } | undefined;
    if (existing) {
      const { error } = await supabase
        .from("documents")
        .update({ green_invoice_id: doc.id, green_invoice_type: type, green_invoice_url: url })
        .eq("id", existing.id);
      if (!error) documentId = existing.id;
    }
  } else if (ins.data) {
    documentId = (ins.data as { id: string }).id;
  }
  if (!documentId) {
    console.error("[green-invoice/documents] documents insert failed:", ins.error);
    warnings.push(
      `המסמך הופק (מס׳ ${doc.number}), אך שמירתו בארכיון המסמכים נכשלה${ins.error ? `: ${toHebrewError(ins.error)}` : ""}`
    );
  }

  // קישורים בין מסמכים: מסמכי Morning מקושרים → השורות שלהם בארכיון
  let linkedCount = 0;
  const linkedIds = payload.linkedDocumentIds ?? [];
  if (documentId && linkedIds.length) {
    const { data: targets, error } = await supabase
      .from("documents")
      .select("id, green_invoice_id, delivery_id")
      .in("green_invoice_id", linkedIds);
    if (error) warnings.push(`שמירת הקישורים בין המסמכים נכשלה: ${toHebrewError(error)}`);
    const rows = ((targets ?? []) as { id: string; green_invoice_id: string; delivery_id: string | null }[]).filter(
      (t) => t.id !== documentId
    );
    if (rows.length) {
      const { error: lErr } = await supabase.from("document_links").insert(
        rows.map((t) => ({
          from_document_id: documentId,
          to_document_id: t.id,
          link_type: payload.linkType ?? "link",
          note: `נוצר בהפקת ${def.name} ${doc.number}`,
        }))
      );
      if (lErr && lErr.code !== "23505") warnings.push(`שמירת הקישורים בין המסמכים נכשלה: ${toHebrewError(lErr)}`);
      else linkedCount = rows.length;
    }
    // ביטול חשבונית של תעודת משלוח — התעודה פנויה להפקה מחדש (כמו בזיכוי מתעודת המשלוח)
    if (payload.linkType === "cancel") {
      for (const t of rows) {
        if (t.delivery_id) {
          await supabase.from("deliveries").update({ green_invoice_id: null }).eq("id", t.delivery_id).eq("green_invoice_id", t.green_invoice_id);
        }
      }
    }
  }

  // תעודת משלוח: חשבונית / חשבונית-קבלה נרשמת בתעודה (כפתור החשבונית בתעודה מציג אותה)
  if (ctx.deliveryId && (type === 305 || type === 320)) {
    await supabase.from("deliveries").update({ green_invoice_id: doc.id }).eq("id", ctx.deliveryId).is("green_invoice_id", null);
  }
  // תשלום: קבלה / חשבונית-קבלה נרשמת בתשלום
  if (ctx.paymentId && (type === 400 || type === 320 || type === 405)) {
    await supabase
      .from("payments")
      .update({ green_invoice_receipt_id: doc.id, green_invoice_receipt_number: String(doc.number), green_invoice_url: url })
      .eq("id", ctx.paymentId)
      .is("green_invoice_receipt_id", null);
  }

  await updateLock(supabase, a.requestId, a.token, {
    status: "issued",
    green_invoice_id: doc.id,
    document_id: documentId,
    error: null,
  });
  revalidateAll();
  const name = def.name;
  return {
    ok: true,
    message: a.recovered
      ? `${name} מס׳ ${doc.number} נמצא ב-Morning (הופק בניסיון הקודם) ונשמר — לא הופק שוב`
      : `הופק ב-Morning: ${name} מס׳ ${doc.number}${payload.attachment && payload.client.emails?.length ? " (נשלח במייל)" : ""}`,
    warning: warnings.length ? warnings.join("\n") : undefined,
    document: {
      greenInvoiceId: doc.id,
      type,
      typeName: name,
      number: String(doc.number),
      url,
      documentId,
      linkedCount,
    },
  };
}

// =============================================================================
// חיפוש ב-Morning (POST /documents/search)
// =============================================================================
const searchSchema = z.object({
  number: z.string().trim().max(20).optional(),
  types: z.array(z.number().int()).max(GI_DOC_TYPES.length).optional(),
  fromDate: z.string().max(10).optional(),
  toDate: z.string().max(10).optional(),
  clientName: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(1).max(GI_LIMITS.maxSearchPageSize).default(25),
});

export type MorningSearchInput = z.input<typeof searchSchema>;

export async function searchMorningDocuments(
  raw: MorningSearchInput
): Promise<MorningResult<{ items: MorningSearchItem[]; total: number; page: number; pages: number }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, code: "auth", message: auth.message };
  if (!isGreenInvoiceConfigured()) return notConfigured();
  const p = searchSchema.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", message: p.error.issues[0]?.message ?? "נתונים לא תקינים" };
  const f = p.data;
  const body: Record<string, unknown> = { page: f.page, pageSize: f.pageSize, sort: "documentDate" };
  if (f.number && /^\d+$/.test(f.number)) body.number = Number(f.number);
  if (f.types?.length) body.type = f.types.filter((t) => isGiDocType(t));
  if (f.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(f.fromDate)) body.fromDate = f.fromDate;
  if (f.toDate && /^\d{4}-\d{2}-\d{2}$/.test(f.toDate)) body.toDate = f.toDate;
  if (f.clientName) body.clientName = f.clientName;
  try {
    const res = await giRequest<{
      total?: number;
      page?: number;
      pages?: number;
      items?: Record<string, unknown>[];
    }>("POST", "/documents/search", { body });
    const items = (res?.items ?? []).filter((d) => typeof d.id === "string");
    const ids = items.map((d) => String(d.id));
    const local = new Map<string, string>();
    if (ids.length) {
      const { data } = await auth.supabase.from("documents").select("id, green_invoice_id").in("green_invoice_id", ids);
      for (const r of (data ?? []) as { id: string; green_invoice_id: string }[]) local.set(r.green_invoice_id, r.id);
    }
    return {
      ok: true,
      message: "",
      total: Number(res?.total ?? items.length),
      page: Number(res?.page ?? f.page),
      pages: Number(res?.pages ?? 1),
      items: items.map((d) => {
        const type = Number(d.type);
        const status = typeof d.status === "number" ? d.status : null;
        const client = (d.client ?? {}) as { name?: string };
        const urls = d.url as { he?: string; origin?: string; en?: string } | undefined;
        return {
          id: String(d.id),
          type,
          typeName: giDocTypeName(type),
          number: String(d.number ?? ""),
          documentDate: typeof d.documentDate === "string" ? d.documentDate : null,
          status,
          statusLabel: status !== null ? (GI_DOC_STATUS_LABELS[status] ?? null) : null,
          amount: typeof d.amount === "number" ? d.amount : null,
          currency: typeof d.currency === "string" ? d.currency : null,
          clientName: client.name ?? null,
          description: typeof d.description === "string" ? d.description : null,
          url: urls?.he || urls?.origin || urls?.en || null,
          localDocumentId: local.get(String(d.id)) ?? null,
        };
      }),
    };
  } catch (e) {
    return failFrom(e, "החיפוש ב-Morning נכשל");
  }
}

/** שורות הארכיון שהופקו ב-Morning (לרשימה) */
export async function listIssuedMorningDocuments(): Promise<MorningResult<{ rows: DocumentViewRow[] }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, code: "auth", message: auth.message };
  const { data, error } = await auth.supabase
    .from("documents_view")
    .select("*")
    .eq("source", "green_invoice")
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) return { ok: false, code: "db_error", message: toHebrewError(error) };
  return { ok: true, message: "", rows: (data ?? []) as DocumentViewRow[] };
}
