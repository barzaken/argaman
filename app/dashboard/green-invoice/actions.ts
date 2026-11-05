"use server";

import { revalidatePath } from "next/cache";

import { z } from "@/lib/zod-he";
import { toHebrewError } from "@/lib/db/errors";
import { expenseCategoryLabels } from "@/lib/db/labels";
import type {
  DeliveryViewRow,
  DocumentKindDb,
  ExpenseCategoryDb,
  ExpenseViewRow,
  InventoryPricingUnitDb,
  PaymentMethodDb,
  PaymentViewRow,
} from "@/lib/db/types";
import { requireAdmin, requireAuth } from "@/lib/supabase/auth-helpers";
import { getAccessToken } from "@/lib/green-invoice/client";
import {
  getGreenInvoiceConfig,
  isGreenInvoiceConfigured,
  missingGreenInvoiceVars,
  resolveGreenInvoiceEnv,
  type GreenInvoiceEnv,
} from "@/lib/green-invoice/config";
import { isGreenInvoiceError, NOT_CONFIGURED_MESSAGE } from "@/lib/green-invoice/errors";
import {
  buildCreditNotePayload,
  buildExpensePayload,
  buildInvoicePayload,
  buildReceiptPayload,
  cleanEmails,
  GI_DOCUMENT_KIND,
  GiMappingError,
  israelToday,
  type BuiltDocument,
  type CrmCustomer,
  type CrmDeliveryLine,
  type CrmOrderCharge,
  type CrmPaymentLine,
  type GiAccountingClassification,
  type GiDocumentType,
} from "@/lib/green-invoice/mappers";
import {
  attachFileToExpense,
  createDocument,
  createExpense,
  documentUrl,
  findClientId,
  findOrCreateClient,
  findOrCreateSupplier,
  findRecentDocuments,
  findRecentExpenses,
  getBusinessName,
  getDocumentInfo,
  listClassifications,
  previewDocument,
  type GiCreatedDocument,
} from "@/lib/green-invoice/service";
import {
  GI_DOCUMENT_TYPE_LABELS,
  makeCancellingMarker,
  makePendingMarker,
  parseGiId,
} from "@/lib/green-invoice/status";

// =============================================================================
// טיפוסים
// =============================================================================
export type GiFailCode =
  | "not_configured"
  | "already_issued"
  | "in_progress"
  | "ambiguous"
  | "invalid"
  | "gi_error"
  | "db_error"
  | "auth";

export type GiFailure = { ok: false; message: string; code: GiFailCode; url?: string | null };
export type GiResult<T extends object = object> = ({ ok: true; message: string; warning?: string } & T) | GiFailure;

export type GiExistingDocument = {
  greenInvoiceId: string;
  type: number | null;
  typeLabel: string | null;
  number: string | null;
  url: string | null;
};

export type ChequeDetailsInput = Record<string, { bankName?: string; bankBranch?: string; bankAccount?: string }>;

export type GiChequeRow = {
  /** מזהה התשלום (payments.id) */
  paymentId: string;
  label: string;
  amount: number;
  reference: string | null;
  bankName: string | null;
};

// =============================================================================
// עזרים
// =============================================================================
type Supa = Extract<Awaited<ReturnType<typeof requireAuth>>, { ok: true }>["supabase"];

const uuid = z.string().uuid();

function notConfigured(): GiFailure {
  return { ok: false, code: "not_configured", message: NOT_CONFIGURED_MESSAGE };
}

function failFrom(e: unknown, context: string): GiFailure {
  if (e instanceof GiMappingError) return { ok: false, code: "invalid", message: e.message };
  if (isGreenInvoiceError(e)) {
    if (e.kind === "not_configured") return notConfigured();
    return { ok: false, code: e.ambiguous ? "ambiguous" : "gi_error", message: `${context}: ${e.errorMessage}` };
  }
  console.error(`[green-invoice] ${context}:`, e);
  const msg = e instanceof Error && /[֐-׿]/.test(e.message) ? e.message : "אירעה שגיאה לא צפויה";
  return { ok: false, code: "gi_error", message: `${context}: ${msg}` };
}

function ambiguousMessage(what: string): string {
  return `לא התקבלה תשובה מ-Green Invoice בזמן — ייתכן ש${what} הופק/ה בכל זאת. נסו שוב בעוד כ-3 דקות: המערכת תבדוק ב-Green Invoice לפני הפקה חוזרת.`;
}

function revalidateAll() {
  for (const p of [
    "/dashboard",
    "/dashboard/deliveries",
    "/dashboard/payments",
    "/dashboard/documents",
    "/dashboard/expenses",
    "/dashboard/debtors",
    "/dashboard/customers",
    "/dashboard/suppliers",
  ]) {
    revalidatePath(p, "layout");
  }
}

function dayBefore(ms: number): string {
  return israelToday(new Date(ms - 24 * 3600 * 1000));
}

/** עדכון מותנה: מחזיר true כשנמצאה שורה שעודכנה */
async function conditionalUpdate(
  supabase: Supa,
  table: "deliveries" | "payments" | "expenses",
  id: string,
  column: string,
  expected: string | null,
  patch: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  let q = supabase.from(table).update(patch).eq("id", id);
  q = expected === null ? q.is(column, null) : q.eq(column, expected);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: toHebrewError(error) };
  return { ok: (data ?? []).length > 0 };
}

async function existingDocument(supabase: Supa, greenInvoiceId: string): Promise<GiExistingDocument> {
  const { data } = await supabase
    .from("documents")
    .select("green_invoice_id, green_invoice_type, green_invoice_url, document_number")
    .eq("green_invoice_id", greenInvoiceId)
    .limit(1);
  const row = (data ?? [])[0] as
    | { green_invoice_type: number | null; green_invoice_url: string | null; document_number: string | null }
    | undefined;
  const type = row?.green_invoice_type ?? null;
  return {
    greenInvoiceId,
    type,
    typeLabel: type ? (GI_DOCUMENT_TYPE_LABELS[type] ?? null) : null,
    number: row?.document_number ?? null,
    url: row?.green_invoice_url ?? null,
  };
}

type DocumentInsert = {
  kind: DocumentKindDb;
  doc: GiCreatedDocument;
  built: BuiltDocument;
  customerId: string;
  customer: CrmCustomer;
  orderId?: string | null;
  deliveryId?: string | null;
  paymentId?: string | null;
  notes?: string | null;
  extra?: Record<string, unknown>;
};

/** שורה ב-documents לכל מסמך שהופק. כישלון כאן לא מבטל את ההפקה — מוחזר כאזהרה. */
async function insertDocumentRow(supabase: Supa, d: DocumentInsert): Promise<string | undefined> {
  const env = resolveGreenInvoiceEnv();
  const { error } = await supabase.from("documents").insert({
    kind: d.kind,
    status: "processed",
    source: "green_invoice",
    document_number: String(d.doc.number),
    document_date: d.built.payload.date ?? israelToday(),
    due_date: d.built.payload.dueDate ?? null,
    currency: "ILS",
    amount_before_vat: d.built.amountBeforeVat,
    vat_amount: d.built.vatAmount,
    amount_total: d.built.amountTotal,
    counterparty_name: d.customer.name,
    counterparty_tax_id: d.customer.tax_id || null,
    customer_id: d.customerId,
    order_id: d.orderId ?? null,
    delivery_id: d.deliveryId ?? null,
    payment_id: d.paymentId ?? null,
    green_invoice_id: d.doc.id,
    green_invoice_type: Number(d.doc.type ?? d.built.payload.type),
    green_invoice_url: documentUrl(d.doc),
    notes: d.notes ?? null,
    extracted: {
      green_invoice: {
        env,
        id: d.doc.id,
        number: d.doc.number,
        type: d.doc.type ?? d.built.payload.type,
        url: d.doc.url ?? null,
        linkedDocumentIds: d.built.payload.linkedDocumentIds ?? [],
        linkType: d.built.payload.linkType ?? null,
        emailedTo: d.built.payload.attachment ? (d.built.payload.client.emails ?? []) : [],
        ...d.extra,
      },
    },
  });
  if (error?.code === "23505") {
    // כבר קיימת שורה באותו סוג + ח.פ + מספר (למשל PDF של אותו מסמך שהועלה ידנית) — מקשרים אותה
    const linked = await linkExistingDocumentRow(supabase, d);
    if (linked) return undefined;
  }
  if (error) {
    console.error("[green-invoice] documents insert failed:", error);
    return `המסמך הופק, אך שמירתו בארכיון המסמכים נכשלה: ${toHebrewError(error)}`;
  }
  return undefined;
}

async function linkExistingDocumentRow(supabase: Supa, d: DocumentInsert): Promise<boolean> {
  let q = supabase
    .from("documents")
    .select("id, customer_id, order_id, delivery_id, payment_id, notes")
    .eq("kind", d.kind)
    .eq("document_number", String(d.doc.number))
    .is("green_invoice_id", null)
    .neq("status", "rejected");
  q = d.customer.tax_id ? q.eq("counterparty_tax_id", d.customer.tax_id) : q.is("counterparty_tax_id", null);
  const { data } = await q.limit(1);
  const row = (data ?? [])[0] as
    | { id: string; customer_id: string | null; order_id: string | null; delivery_id: string | null; payment_id: string | null; notes: string | null }
    | undefined;
  if (!row) return false;
  const { error } = await supabase
    .from("documents")
    .update({
      green_invoice_id: d.doc.id,
      green_invoice_type: Number(d.doc.type ?? d.built.payload.type),
      green_invoice_url: documentUrl(d.doc),
      customer_id: row.customer_id ?? d.customerId,
      order_id: row.order_id ?? d.orderId ?? null,
      delivery_id: row.delivery_id ?? d.deliveryId ?? null,
      payment_id: row.payment_id ?? d.paymentId ?? null,
    })
    .eq("id", row.id);
  if (error) {
    console.error("[green-invoice] documents link failed:", error);
    return false;
  }
  return true;
}

/**
 * נעילה ישנה: האם המסמך הופק בכל זאת? מסננים מסמכים שכבר רשומים אצלנו (documents.green_invoice_id).
 * one → מאמצים; none → אפשר להפיק; many → עוצרים (בדיקה ידנית) — לעולם לא מפיקים כשיש ספק.
 */
async function recoverFromStaleLock(
  supabase: Supa,
  opts: { type: number; description: string; since: number; amount: number }
): Promise<{ kind: "none" } | { kind: "one"; doc: GiCreatedDocument } | { kind: "many"; count: number }> {
  const items = await findRecentDocuments({
    type: opts.type,
    description: opts.description,
    fromDate: dayBefore(opts.since),
    expectedAmount: opts.amount,
  });
  if (!items.length) return { kind: "none" };
  const { data, error } = await supabase
    .from("documents")
    .select("green_invoice_id")
    .in("green_invoice_id", items.map((i) => i.id));
  if (error) throw new Error(toHebrewError(error));
  const known = new Set(((data ?? []) as { green_invoice_id: string }[]).map((r) => r.green_invoice_id));
  const unknown = items.filter((i) => !known.has(i.id));
  if (!unknown.length) return { kind: "none" };
  if (unknown.length === 1) return { kind: "one", doc: unknown[0] };
  return { kind: "many", count: unknown.length };
}

const MANY_CANDIDATES_MESSAGE =
  "נמצאו ב-Green Invoice כמה מסמכים מתאימים שלא נרשמו במערכת — בדקו שם ידנית לפני הפקה חוזרת";

// =============================================================================
// טעינת נתונים
// =============================================================================
type DeliveryBundle = {
  delivery: DeliveryViewRow;
  lines: CrmDeliveryLine[];
  charges: CrmOrderCharge[];
  vatRate: number;
  customer: CrmCustomer;
};

async function loadDeliveryBundle(supabase: Supa, deliveryId: string): Promise<DeliveryBundle | GiFailure> {
  const { data: d, error } = await supabase.from("deliveries_view").select("*").eq("id", deliveryId).maybeSingle();
  if (error) return { ok: false, code: "db_error", message: toHebrewError(error) };
  if (!d) return { ok: false, code: "invalid", message: "תעודת המשלוח לא נמצאה" };
  const delivery = d as DeliveryViewRow;

  const [itemsRes, chargesRes, orderRes, customerRes] = await Promise.all([
    supabase.from("delivery_items").select("*, inventory_items(pricing_unit)").eq("delivery_id", deliveryId),
    supabase.from("order_charges").select("kind, description, amount, sort_order").eq("order_id", delivery.order_id),
    supabase.from("orders").select("vat_rate").eq("id", delivery.order_id).maybeSingle(),
    supabase.from("customers").select("name, tax_id, email, phone, address").eq("id", delivery.customer_id).maybeSingle(),
  ]);
  for (const r of [itemsRes, chargesRes, orderRes, customerRes]) {
    if (r.error) return { ok: false, code: "db_error", message: toHebrewError(r.error) };
  }
  if (!customerRes.data) return { ok: false, code: "invalid", message: "הלקוח של התעודה לא נמצא" };

  const lines: CrmDeliveryLine[] = (itemsRes.data ?? []).map((row: Record<string, unknown>) => {
    const inv = row.inventory_items as { pricing_unit: InventoryPricingUnitDb } | null;
    return {
      stone_name: String(row.stone_name ?? ""),
      length_m: Number(row.length_m),
      width_m: Number(row.width_m),
      height_m: Number(row.height_m),
      quantity: Number(row.quantity),
      volume_m3: Number(row.volume_m3),
      price_per_m3: Number(row.price_per_m3),
      line_subtotal: Number(row.line_subtotal),
      inventory_pricing_unit: inv?.pricing_unit ?? "m3",
    };
  });
  const charges = (chargesRes.data ?? []).map((c: Record<string, unknown>) => ({
    kind: c.kind as CrmOrderCharge["kind"],
    description: String(c.description ?? ""),
    amount: Number(c.amount),
    sort_order: c.sort_order === null ? null : Number(c.sort_order),
  }));
  const vatRate = orderRes.data ? Number((orderRes.data as { vat_rate: number }).vat_rate) : 0.18;
  return { delivery, lines, charges, vatRate, customer: customerRes.data as CrmCustomer };
}

type CoveringPayments = {
  lines: CrmPaymentLine[];
  cheques: GiChequeRow[];
  /** תשלומים שכל סכומם הוקצה לתעודה הזו (יסומנו כ"קבלה = החשבונית 320") */
  fullyCoveredPaymentIds: string[];
  /** סיבה למה אי אפשר 320 (null = אפשר) */
  blocker: string | null;
};

async function loadCoveringPayments(
  supabase: Supa,
  delivery: DeliveryViewRow,
  cheques: ChequeDetailsInput | undefined
): Promise<CoveringPayments | GiFailure> {
  const { data: allocs, error } = await supabase
    .from("payment_allocations_view")
    .select("payment_id, amount, paid_at, method, reference, payment_number")
    .eq("delivery_id", delivery.id);
  if (error) return { ok: false, code: "db_error", message: toHebrewError(error) };
  const allocations = (allocs ?? []) as {
    payment_id: string;
    amount: number;
    paid_at: string;
    method: PaymentMethodDb;
    reference: string | null;
    payment_number: number;
  }[];

  const ids = [...new Set(allocations.map((a) => a.payment_id))];
  const payMap = new Map<string, { amount: number; bank_name: string | null; green_invoice_receipt_id: string | null; payment_number: number }>();
  if (ids.length) {
    const { data: pays, error: pErr } = await supabase
      .from("payments")
      .select("id, amount, bank_name, green_invoice_receipt_id, payment_number")
      .in("id", ids);
    if (pErr) return { ok: false, code: "db_error", message: toHebrewError(pErr) };
    for (const p of (pays ?? []) as { id: string; amount: number; bank_name: string | null; green_invoice_receipt_id: string | null; payment_number: number }[]) {
      payMap.set(p.id, p);
    }
  }

  let blocker: string | null = null;
  if (delivery.payment_status !== "paid" || Number(delivery.balance) > 0.005) {
    blocker = "התעודה לא שולמה במלואה — אפשר להפיק רק חשבונית מס (305)";
  }
  const lines: CrmPaymentLine[] = [];
  const chequeRows: GiChequeRow[] = [];
  const fully: string[] = [];
  for (const a of allocations) {
    const p = payMap.get(a.payment_id);
    const label = `תשלום ${a.payment_number}`;
    if (p?.green_invoice_receipt_id && !blocker) {
      blocker = `ל${label} כבר הופקה קבלה — הפיקו חשבונית מס (305)`;
    }
    const extra = cheques?.[a.payment_id];
    lines.push({
      date: a.paid_at,
      method: a.method,
      amount: Number(a.amount),
      reference: a.reference,
      bank_name: extra?.bankName?.trim() || p?.bank_name || null,
      bank_branch: extra?.bankBranch ?? null,
      bank_account: extra?.bankAccount ?? null,
      label,
    });
    if (a.method === "check") {
      chequeRows.push({ paymentId: a.payment_id, label, amount: Number(a.amount), reference: a.reference, bankName: p?.bank_name ?? null });
    }
    if (a.method === "other" && !blocker) {
      blocker = `ל${label} אמצעי תשלום "אחר" — עדכנו אותו כדי להפיק חשבונית מס/קבלה`;
    }
    if (p && Math.abs(Number(p.amount) - Number(a.amount)) < 0.005) fully.push(a.payment_id);
  }
  const outside = Number(delivery.paid_outside_payments ?? 0);
  if (outside > 0.005) {
    const method = delivery.payment_method;
    lines.push({
      date: delivery.paid_at ?? delivery.delivered_at ?? israelToday(),
      method,
      amount: outside,
      reference: null,
      bank_name: null,
      label: "תשלום שסומן ידנית בתעודה",
    });
    if ((!method || method === "other" || method === "check") && !blocker) {
      blocker =
        "התעודה סומנה כ\"שולמה\" בלי רישום תשלום מפורט — רשמו תשלום (עם אמצעי תשלום) כדי להפיק חשבונית מס/קבלה";
    }
  }
  return { lines, cheques: chequeRows, fullyCoveredPaymentIds: fully, blocker };
}

// =============================================================================
// חשבונית לתעודת משלוח
// =============================================================================
export type InvoiceDialogData = {
  configured: boolean;
  env: GreenInvoiceEnv;
  isAdmin: boolean;
  delivery: {
    id: string;
    number: number;
    orderNumber: number;
    customerName: string;
    customerEmail: string | null;
    subtotal: number;
    vatAmount: number;
    total: number;
    balance: number;
    paymentStatus: string;
    cancelled: boolean;
  };
  existing: GiExistingDocument | null;
  inProgress: boolean;
  /** הפקה קודמת לא הסתיימה (נעילה ישנה) — בהפקה הבאה המערכת בודקת קודם ב-Green Invoice */
  recovering: boolean;
  /** null = אפשר להפיק 320; אחרת הסיבה */
  invoiceReceiptBlocker: string | null;
  cheques: GiChequeRow[];
};

export async function getInvoiceDialogData(deliveryId: string): Promise<GiResult<{ data: InvoiceDialogData }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, code: "auth", message: auth.message };
  if (!uuid.safeParse(deliveryId).success) return { ok: false, code: "invalid", message: "מזהה לא תקין" };
  const bundle = await loadDeliveryBundle(auth.supabase, deliveryId);
  if ("ok" in bundle) return bundle;
  const d = bundle.delivery;
  const cover = await loadCoveringPayments(auth.supabase, d, undefined);
  if ("ok" in cover) return cover;
  const state = parseGiId(d.green_invoice_id);
  return {
    ok: true,
    message: "",
    data: {
      configured: isGreenInvoiceConfigured(),
      env: resolveGreenInvoiceEnv(),
      isAdmin: auth.isAdmin,
      delivery: {
        id: d.id,
        number: d.delivery_number,
        orderNumber: d.order_number,
        customerName: d.customer_name,
        customerEmail: bundle.customer.email,
        subtotal: Number(d.subtotal),
        vatAmount: Number(d.vat_amount),
        total: Number(d.total),
        balance: Number(d.balance),
        paymentStatus: d.payment_status,
        cancelled: d.status === "cancelled",
      },
      existing: state.state === "issued" ? await existingDocument(auth.supabase, state.id) : null,
      inProgress: (state.state === "pending" || state.state === "cancelling") && !state.stale,
      recovering: state.state === "pending" && state.stale,
      invoiceReceiptBlocker: cover.blocker,
      cheques: cover.cheques,
    },
  };
}

const invoiceTypeSchema = z.union([z.literal(305), z.literal(320)]);

const chequesSchema = z
  .record(
    z.string(),
    z.object({
      bankName: z.string().max(80).optional(),
      bankBranch: z.string().max(20).optional(),
      bankAccount: z.string().max(30).optional(),
    })
  )
  .optional();

async function buildInvoiceFor(
  supabase: Supa,
  bundle: DeliveryBundle,
  type: 305 | 320,
  opts: { clientId: string | null; emails: string[] | null; remarks?: string | null; cheques?: ChequeDetailsInput }
): Promise<{ built: BuiltDocument; cover: CoveringPayments | null } | GiFailure> {
  let cover: CoveringPayments | null = null;
  if (type === 320) {
    const c = await loadCoveringPayments(supabase, bundle.delivery, opts.cheques);
    if ("ok" in c) return c;
    if (c.blocker) return { ok: false, code: "invalid", message: c.blocker };
    cover = c;
  }
  try {
    const built = buildInvoicePayload({
      type,
      delivery: bundle.delivery,
      lines: bundle.lines,
      charges: bundle.charges,
      vatRate: bundle.vatRate,
      customer: bundle.customer,
      clientId: opts.clientId,
      emails: opts.emails,
      remarks: opts.remarks,
      payments: cover?.lines,
    });
    return { built, cover };
  } catch (e) {
    return failFrom(e, "בניית החשבונית");
  }
}

/** תצוגה מקדימה (POST /documents/preview) — לא צורך מספר מסמך. מחזיר PDF ב-base64. */
export async function previewInvoiceForDelivery(
  deliveryId: string,
  type: 305 | 320,
  opts: { cheques?: ChequeDetailsInput; remarks?: string } = {}
): Promise<GiResult<{ pdfBase64: string }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, code: "auth", message: auth.message };
  if (!isGreenInvoiceConfigured()) return notConfigured();
  if (!uuid.safeParse(deliveryId).success || !invoiceTypeSchema.safeParse(type).success) {
    return { ok: false, code: "invalid", message: "נתונים לא תקינים" };
  }
  const cheques = chequesSchema.safeParse(opts.cheques);
  const bundle = await loadDeliveryBundle(auth.supabase, deliveryId);
  if ("ok" in bundle) return bundle;
  try {
    const clientId = await findClientId(bundle.delivery.customer_id, bundle.customer);
    const b = await buildInvoiceFor(auth.supabase, bundle, type, {
      clientId,
      emails: null,
      remarks: opts.remarks?.slice(0, 500),
      cheques: cheques.success ? cheques.data : undefined,
    });
    if ("ok" in b) return b;
    const pdfBase64 = await previewDocument(b.built.payload);
    return { ok: true, message: "", pdfBase64 };
  } catch (e) {
    return failFrom(e, "תצוגה מקדימה נכשלה");
  }
}

const issueInvoiceSchema = z.object({
  type: invoiceTypeSchema,
  sendEmail: z.boolean().default(false),
  emails: z.array(z.string().max(200)).max(5).optional(),
  remarks: z.string().max(500).optional().nullable(),
  cheques: chequesSchema,
});

export type IssueInvoiceInput = z.input<typeof issueInvoiceSchema>;

export async function issueInvoiceForDelivery(
  deliveryId: string,
  raw: IssueInvoiceInput
): Promise<GiResult<{ document: GiExistingDocument }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, code: "auth", message: auth.message };
  if (!isGreenInvoiceConfigured()) return notConfigured();
  const parsed = issueInvoiceSchema.safeParse(raw);
  if (!uuid.safeParse(deliveryId).success || !parsed.success) {
    return { ok: false, code: "invalid", message: "נתונים לא תקינים" };
  }
  const input = parsed.data;
  const supabase = auth.supabase;
  const bundle = await loadDeliveryBundle(supabase, deliveryId);
  if ("ok" in bundle) return bundle;
  const d = bundle.delivery;

  const emails = input.sendEmail ? cleanEmails(input.emails?.length ? input.emails : [bundle.customer.email]) : null;
  if (input.sendEmail && !emails?.length) {
    return { ok: false, code: "invalid", message: "לא הוזנה כתובת מייל תקינה לשליחה" };
  }

  // בדיקת תקינות לפני נעילה (בלי מזהה לקוח — רק לוולידציה)
  const pre = await buildInvoiceFor(supabase, bundle, input.type, {
    clientId: "validation",
    emails,
    remarks: input.remarks,
    cheques: input.cheques,
  });
  if ("ok" in pre) return pre;
  const description = pre.built.payload.description!;

  // ---- נעילה ----
  const state = parseGiId(d.green_invoice_id);
  if (state.state === "issued") {
    const ex = await existingDocument(supabase, state.id);
    return {
      ok: false,
      code: "already_issued",
      url: ex.url,
      message: `לתעודה ${d.delivery_number} כבר הופקה ${ex.typeLabel ?? "חשבונית"}${ex.number ? ` מס׳ ${ex.number}` : ""} — לא מפיקים פעמיים`,
    };
  }
  if (state.state === "cancelling" || (state.state === "pending" && !state.stale)) {
    return { ok: false, code: "in_progress", message: "הפקת מסמך לתעודה זו כבר מתבצעת — המתינו ורעננו את הדף" };
  }
  const marker = makePendingMarker();
  let claimed: { ok: boolean; error?: string };
  if (state.state === "pending") {
    // נעילה תקועה — בודקים אם המסמך הופק בכל זאת
    try {
      const r = await recoverFromStaleLock(supabase, {
        type: input.type,
        description,
        since: state.since,
        amount: pre.built.amountTotal,
      });
      if (r.kind === "one") return finalizeInvoice(supabase, bundle, d.green_invoice_id!, r.doc, pre.built, pre.cover, true);
      if (r.kind === "many") return { ok: false, code: "ambiguous", message: MANY_CANDIDATES_MESSAGE };
    } catch (e) {
      return failFrom(e, "בדיקת הפקה קודמת נכשלה");
    }
    claimed = await conditionalUpdate(supabase, "deliveries", d.id, "green_invoice_id", d.green_invoice_id, { green_invoice_id: marker });
  } else {
    claimed = await conditionalUpdate(supabase, "deliveries", d.id, "green_invoice_id", null, { green_invoice_id: marker });
  }
  if (claimed.error) return { ok: false, code: "db_error", message: claimed.error };
  if (!claimed.ok) {
    return { ok: false, code: "in_progress", message: "התעודה עודכנה במקביל (ייתכן שכבר הופקה חשבונית) — רעננו את הדף" };
  }
  const release = () =>
    conditionalUpdate(supabase, "deliveries", d.id, "green_invoice_id", marker, { green_invoice_id: null });

  // ---- לקוח + הפקה ----
  let built: BuiltDocument;
  let cover: CoveringPayments | null;
  try {
    const client = await findOrCreateClient(d.customer_id, bundle.customer);
    const b = await buildInvoiceFor(supabase, bundle, input.type, {
      clientId: client.id,
      emails,
      remarks: input.remarks,
      cheques: input.cheques,
    });
    if ("ok" in b) {
      await release();
      return b;
    }
    built = b.built;
    cover = b.cover;
  } catch (e) {
    await release();
    return failFrom(e, "איתור הלקוח ב-Green Invoice נכשל");
  }

  let doc: GiCreatedDocument;
  try {
    doc = await createDocument(built.payload);
  } catch (e) {
    const f = failFrom(e, "הפקת החשבונית נכשלה");
    if (f.code === "ambiguous" || !isGreenInvoiceError(e)) {
      return { ok: false, code: "ambiguous", message: ambiguousMessage("החשבונית") };
    }
    await release();
    return f;
  }
  return finalizeInvoice(supabase, bundle, marker, doc, built, cover);
}

async function finalizeInvoice(
  supabase: Supa,
  bundle: DeliveryBundle,
  marker: string,
  doc: GiCreatedDocument,
  built: BuiltDocument,
  cover: CoveringPayments | null,
  recovered = false
): Promise<GiResult<{ document: GiExistingDocument }>> {
  const d = bundle.delivery;
  const type = Number(doc.type ?? built.payload.type) as GiDocumentType;
  const url = documentUrl(doc);
  const warnings: string[] = [];

  const upd = await conditionalUpdate(supabase, "deliveries", d.id, "green_invoice_id", marker, { green_invoice_id: doc.id });
  if (!upd.ok) {
    warnings.push(
      `החשבונית הופקה (מס׳ ${doc.number}) אך שמירת המזהה בתעודה נכשלה${upd.error ? `: ${upd.error}` : ""} — עדכנו ידנית: ${doc.id}`
    );
  }
  const w = await insertDocumentRow(supabase, {
    kind: GI_DOCUMENT_KIND[type === 320 ? 320 : 305] as DocumentKindDb,
    doc,
    built,
    customerId: d.customer_id,
    customer: bundle.customer,
    orderId: d.order_id,
    deliveryId: d.id,
    notes: `תעודת משלוח ${d.delivery_number}`,
  });
  if (w) warnings.push(w);

  // 320 הוא גם קבלה: תשלומים שכולם הוקצו לתעודה הזו מסומנים כ"יש קבלה"
  if (type === 320 && cover) {
    for (const pid of cover.fullyCoveredPaymentIds) {
      await conditionalUpdate(supabase, "payments", pid, "green_invoice_receipt_id", null, {
        green_invoice_receipt_id: doc.id,
        green_invoice_receipt_number: String(doc.number),
        green_invoice_url: url,
      });
    }
  }
  revalidateAll();
  const label = GI_DOCUMENT_TYPE_LABELS[type] ?? "מסמך";
  return {
    ok: true,
    message: recovered
      ? `${label} מס׳ ${doc.number} כבר הופקה בניסיון הקודם (נמצאה ב-Green Invoice) ונשמרה — לא הופקה שוב`
      : `${label} מס׳ ${doc.number} הופקה ב-Green Invoice${built.payload.attachment ? " ונשלחה במייל" : ""}`,
    warning: warnings.length ? warnings.join("\n") : undefined,
    document: { greenInvoiceId: doc.id, type, typeLabel: label, number: String(doc.number), url },
  };
}

// =============================================================================
// חשבונית זיכוי (מנהל בלבד)
// =============================================================================
const creditSchema = z.object({ reason: z.string().trim().min(2, "יש לציין סיבה לזיכוי").max(300) });

export async function issueCreditNoteForDelivery(
  deliveryId: string,
  raw: { reason: string }
): Promise<GiResult<{ document: GiExistingDocument }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, code: "auth", message: auth.message };
  if (!isGreenInvoiceConfigured()) return notConfigured();
  const parsed = creditSchema.safeParse(raw);
  if (!uuid.safeParse(deliveryId).success) return { ok: false, code: "invalid", message: "מזהה לא תקין" };
  if (!parsed.success) return { ok: false, code: "invalid", message: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" };
  const supabase = auth.supabase;
  const bundle = await loadDeliveryBundle(supabase, deliveryId);
  if ("ok" in bundle) return bundle;
  const d = bundle.delivery;
  const state = parseGiId(d.green_invoice_id);

  if (state.state === "none") return { ok: false, code: "invalid", message: "לתעודה אין חשבונית לזכות" };
  if (state.state === "pending" || (state.state === "cancelling" && !state.stale)) {
    return { ok: false, code: "in_progress", message: "פעולה אחרת על החשבונית מתבצעת כרגע — המתינו ורעננו" };
  }
  const originalId = state.state === "issued" ? state.id : state.originalId;
  const original = await existingDocument(supabase, originalId);

  let built: BuiltDocument;
  try {
    built = buildCreditNotePayload({
      originalGreenInvoiceId: originalId,
      originalNumber: original.number,
      delivery: d,
      lines: bundle.lines,
      charges: bundle.charges,
      vatRate: bundle.vatRate,
      customer: bundle.customer,
      clientId: "validation",
      reason: parsed.data.reason,
    });
  } catch (e) {
    return failFrom(e, "בניית חשבונית הזיכוי");
  }

  const marker = makeCancellingMarker(originalId);
  if (state.state === "cancelling") {
    try {
      const r = await recoverFromStaleLock(supabase, {
        type: 330,
        description: built.payload.description!,
        since: state.since,
        amount: built.amountTotal,
      });
      if (r.kind === "one") return finalizeCredit(supabase, bundle, d.green_invoice_id!, r.doc, built, original);
      if (r.kind === "many") return { ok: false, code: "ambiguous", message: MANY_CANDIDATES_MESSAGE };
    } catch (e) {
      return failFrom(e, "בדיקת זיכוי קודם נכשלה");
    }
  }
  const claimed = await conditionalUpdate(supabase, "deliveries", d.id, "green_invoice_id", d.green_invoice_id, { green_invoice_id: marker });
  if (claimed.error) return { ok: false, code: "db_error", message: claimed.error };
  if (!claimed.ok) return { ok: false, code: "in_progress", message: "התעודה עודכנה במקביל — רעננו את הדף" };
  const restore = () =>
    conditionalUpdate(supabase, "deliveries", d.id, "green_invoice_id", marker, { green_invoice_id: originalId });

  try {
    const client = await findOrCreateClient(d.customer_id, bundle.customer);
    built = buildCreditNotePayload({
      originalGreenInvoiceId: originalId,
      originalNumber: original.number,
      delivery: d,
      lines: bundle.lines,
      charges: bundle.charges,
      vatRate: bundle.vatRate,
      customer: bundle.customer,
      clientId: client.id,
      reason: parsed.data.reason,
    });
  } catch (e) {
    await restore();
    return failFrom(e, "איתור הלקוח ב-Green Invoice נכשל");
  }
  let doc: GiCreatedDocument;
  try {
    doc = await createDocument(built.payload);
  } catch (e) {
    const f = failFrom(e, "הפקת חשבונית הזיכוי נכשלה");
    if (f.code === "ambiguous" || !isGreenInvoiceError(e)) {
      return { ok: false, code: "ambiguous", message: ambiguousMessage("חשבונית הזיכוי") };
    }
    await restore();
    return f;
  }
  return finalizeCredit(supabase, bundle, marker, doc, built, original);
}

async function finalizeCredit(
  supabase: Supa,
  bundle: DeliveryBundle,
  marker: string,
  doc: GiCreatedDocument,
  built: BuiltDocument,
  original: GiExistingDocument
): Promise<GiResult<{ document: GiExistingDocument }>> {
  const d = bundle.delivery;
  const warnings: string[] = [];
  // אחרי זיכוי התעודה פנויה להפקת חשבונית מתוקנת; המקור נשאר בארכיון המסמכים
  const upd = await conditionalUpdate(supabase, "deliveries", d.id, "green_invoice_id", marker, { green_invoice_id: null });
  if (!upd.ok) warnings.push(`חשבונית הזיכוי הופקה, אך עדכון התעודה נכשל${upd.error ? `: ${upd.error}` : ""}`);
  const w = await insertDocumentRow(supabase, {
    kind: "customer_credit_note",
    doc,
    built,
    customerId: d.customer_id,
    customer: bundle.customer,
    orderId: d.order_id,
    deliveryId: d.id,
    notes: `זיכוי ל${original.typeLabel ?? "חשבונית"}${original.number ? ` מס׳ ${original.number}` : ""} · תעודת משלוח ${d.delivery_number}`,
    extra: { cancels: original.greenInvoiceId },
  });
  if (w) warnings.push(w);
  const { error: nErr } = await supabase
    .from("documents")
    .update({ notes: `בוטלה בחשבונית זיכוי מס׳ ${doc.number}` })
    .eq("green_invoice_id", original.greenInvoiceId);
  if (nErr) console.error("[green-invoice] original note update failed:", nErr);
  revalidateAll();
  const url = documentUrl(doc);
  return {
    ok: true,
    message: `חשבונית זיכוי מס׳ ${doc.number} הופקה ב-Green Invoice`,
    warning: warnings.length ? warnings.join("\n") : undefined,
    document: { greenInvoiceId: doc.id, type: 330, typeLabel: GI_DOCUMENT_TYPE_LABELS[330], number: String(doc.number), url },
  };
}

// =============================================================================
// קבלה לתשלום
// =============================================================================
type PaymentBundle = {
  payment: PaymentViewRow;
  customer: CrmCustomer;
  /** תעודות שהתשלום הוקצה להן */
  deliveries: { id: string; number: number; giId: string | null }[];
  linkedInvoiceIds: string[];
  blocker: string | null;
  notInvoiced: number[];
};

async function loadPaymentBundle(supabase: Supa, paymentId: string): Promise<PaymentBundle | GiFailure> {
  const { data: p, error } = await supabase.from("payments_view").select("*").eq("id", paymentId).maybeSingle();
  if (error) return { ok: false, code: "db_error", message: toHebrewError(error) };
  if (!p) return { ok: false, code: "invalid", message: "התשלום לא נמצא" };
  const payment = p as PaymentViewRow;
  const [custRes, allocRes] = await Promise.all([
    supabase.from("customers").select("name, tax_id, email, phone, address").eq("id", payment.customer_id).maybeSingle(),
    supabase.from("payment_allocations").select("delivery_id, amount").eq("payment_id", paymentId),
  ]);
  if (custRes.error) return { ok: false, code: "db_error", message: toHebrewError(custRes.error) };
  if (allocRes.error) return { ok: false, code: "db_error", message: toHebrewError(allocRes.error) };
  if (!custRes.data) return { ok: false, code: "invalid", message: "הלקוח לא נמצא" };
  const deliveryIds = [...new Set(((allocRes.data ?? []) as { delivery_id: string }[]).map((a) => a.delivery_id))];

  const deliveries: PaymentBundle["deliveries"] = [];
  if (deliveryIds.length) {
    const { data: ds, error: dErr } = await supabase
      .from("deliveries")
      .select("id, delivery_number, green_invoice_id")
      .in("id", deliveryIds);
    if (dErr) return { ok: false, code: "db_error", message: toHebrewError(dErr) };
    for (const r of (ds ?? []) as { id: string; delivery_number: number; green_invoice_id: string | null }[]) {
      deliveries.push({ id: r.id, number: Number(r.delivery_number), giId: r.green_invoice_id });
    }
  }
  deliveries.sort((a, b) => a.number - b.number);

  let blocker: string | null = null;
  const linked: string[] = [];
  const notInvoiced: number[] = [];
  const issuedIds: string[] = [];
  for (const del of deliveries) {
    const st = parseGiId(del.giId);
    if (st.state === "issued") issuedIds.push(st.id);
    else if (st.state === "none") notInvoiced.push(del.number);
    else if (!blocker) blocker = `מסמך לתעודה ${del.number} נמצא בהפקה — נסו שוב בעוד רגע`;
  }
  if (issuedIds.length) {
    const { data: docs } = await supabase
      .from("documents")
      .select("green_invoice_id, green_invoice_type, document_number")
      .in("green_invoice_id", issuedIds);
    const typeById = new Map(
      ((docs ?? []) as { green_invoice_id: string; green_invoice_type: number | null; document_number: string | null }[]).map(
        (x) => [x.green_invoice_id, x]
      )
    );
    for (const del of deliveries) {
      const st = parseGiId(del.giId);
      if (st.state !== "issued") continue;
      const info = typeById.get(st.id);
      if (info?.green_invoice_type === 320) {
        if (!blocker) {
          blocker = `לתעודה ${del.number} הופקה חשבונית מס/קבלה${info.document_number ? ` מס׳ ${info.document_number}` : ""} — התשלום כבר מתועד בה, אין להפיק קבלה נוספת`;
        }
      } else {
        linked.push(st.id);
      }
    }
  }
  return { payment, customer: custRes.data as CrmCustomer, deliveries, linkedInvoiceIds: linked, blocker, notInvoiced };
}

export type ReceiptDialogData = {
  configured: boolean;
  env: GreenInvoiceEnv;
  payment: {
    id: string;
    number: number;
    amount: number;
    paidAt: string;
    method: PaymentMethodDb;
    reference: string | null;
    bankName: string | null;
    customerName: string;
    customerEmail: string | null;
    deliveryNumbers: number[];
  };
  existing: GiExistingDocument | null;
  inProgress: boolean;
  recovering: boolean;
  blocker: string | null;
  /** תעודות שעדיין אין להן חשבונית (הקבלה לא תקושר אליהן) */
  notInvoiced: number[];
  linkedInvoices: number;
};

export async function getReceiptDialogData(paymentId: string): Promise<GiResult<{ data: ReceiptDialogData }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, code: "auth", message: auth.message };
  if (!uuid.safeParse(paymentId).success) return { ok: false, code: "invalid", message: "מזהה לא תקין" };
  const b = await loadPaymentBundle(auth.supabase, paymentId);
  if ("ok" in b) return b;
  const st = parseGiId(b.payment.green_invoice_receipt_id);
  let existing: GiExistingDocument | null = null;
  if (st.state === "issued") {
    existing = await existingDocument(auth.supabase, st.id);
    if (!existing.url) existing.url = b.payment.green_invoice_url;
    if (!existing.number) existing.number = b.payment.green_invoice_receipt_number;
  }
  return {
    ok: true,
    message: "",
    data: {
      configured: isGreenInvoiceConfigured(),
      env: resolveGreenInvoiceEnv(),
      payment: {
        id: b.payment.id,
        number: b.payment.payment_number,
        amount: Number(b.payment.amount),
        paidAt: b.payment.paid_at,
        method: b.payment.method,
        reference: b.payment.reference,
        bankName: b.payment.bank_name,
        customerName: b.payment.customer_name,
        customerEmail: b.customer.email,
        deliveryNumbers: b.deliveries.map((x) => x.number),
      },
      existing,
      inProgress: st.state === "pending" && !st.stale,
      recovering: st.state === "pending" && st.stale,
      blocker: b.blocker,
      notInvoiced: b.notInvoiced,
      linkedInvoices: b.linkedInvoiceIds.length,
    },
  };
}

const issueReceiptSchema = z.object({
  sendEmail: z.boolean().default(false),
  emails: z.array(z.string().max(200)).max(5).optional(),
  remarks: z.string().max(500).optional().nullable(),
  bankName: z.string().max(80).optional(),
  bankBranch: z.string().max(20).optional(),
  bankAccount: z.string().max(30).optional(),
});
export type IssueReceiptInput = z.input<typeof issueReceiptSchema>;

function buildReceiptFor(b: PaymentBundle, clientId: string | null, emails: string[] | null, input: z.output<typeof issueReceiptSchema>) {
  const p = b.payment;
  return buildReceiptPayload({
    paymentNumber: p.payment_number,
    payment: {
      date: p.paid_at,
      method: p.method,
      amount: Number(p.amount),
      reference: p.reference,
      bank_name: input.bankName?.trim() || p.bank_name,
      bank_branch: input.bankBranch ?? null,
      bank_account: input.bankAccount ?? null,
      label: `תשלום ${p.payment_number}`,
    },
    customer: b.customer,
    clientId,
    linkedInvoiceIds: b.linkedInvoiceIds,
    deliveryNumbers: b.deliveries.map((x) => x.number),
    emails,
    remarks: input.remarks,
  });
}

export async function previewReceiptForPayment(
  paymentId: string,
  raw: IssueReceiptInput = {}
): Promise<GiResult<{ pdfBase64: string }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, code: "auth", message: auth.message };
  if (!isGreenInvoiceConfigured()) return notConfigured();
  const parsed = issueReceiptSchema.safeParse(raw);
  if (!uuid.safeParse(paymentId).success || !parsed.success) return { ok: false, code: "invalid", message: "נתונים לא תקינים" };
  const b = await loadPaymentBundle(auth.supabase, paymentId);
  if ("ok" in b) return b;
  if (b.blocker) return { ok: false, code: "invalid", message: b.blocker };
  try {
    const clientId = await findClientId(b.payment.customer_id, b.customer);
    const built = buildReceiptFor(b, clientId, null, parsed.data);
    return { ok: true, message: "", pdfBase64: await previewDocument(built.payload) };
  } catch (e) {
    return failFrom(e, "תצוגה מקדימה נכשלה");
  }
}

export async function issueReceiptForPayment(
  paymentId: string,
  raw: IssueReceiptInput
): Promise<GiResult<{ document: GiExistingDocument }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, code: "auth", message: auth.message };
  if (!isGreenInvoiceConfigured()) return notConfigured();
  const parsed = issueReceiptSchema.safeParse(raw);
  if (!uuid.safeParse(paymentId).success || !parsed.success) return { ok: false, code: "invalid", message: "נתונים לא תקינים" };
  const input = parsed.data;
  const supabase = auth.supabase;
  const b = await loadPaymentBundle(supabase, paymentId);
  if ("ok" in b) return b;
  const p = b.payment;

  const st = parseGiId(p.green_invoice_receipt_id);
  if (st.state === "issued") {
    const ex = await existingDocument(supabase, st.id);
    return {
      ok: false,
      code: "already_issued",
      url: ex.url ?? p.green_invoice_url,
      message: `לתשלום ${p.payment_number} כבר הופקה ${ex.typeLabel ?? "קבלה"} מס׳ ${ex.number ?? p.green_invoice_receipt_number ?? ""} — לא מפיקים פעמיים`.trim(),
    };
  }
  if (st.state === "pending" && !st.stale) {
    return { ok: false, code: "in_progress", message: "הפקת קבלה לתשלום זה כבר מתבצעת — המתינו ורעננו את הדף" };
  }
  if (b.blocker) return { ok: false, code: "invalid", message: b.blocker };

  const emails = input.sendEmail ? cleanEmails(input.emails?.length ? input.emails : [b.customer.email]) : null;
  if (input.sendEmail && !emails?.length) return { ok: false, code: "invalid", message: "לא הוזנה כתובת מייל תקינה לשליחה" };

  let built: BuiltDocument;
  try {
    built = buildReceiptFor(b, "validation", emails, input);
  } catch (e) {
    return failFrom(e, "בניית הקבלה");
  }

  const marker = makePendingMarker();
  if (st.state === "pending") {
    try {
      const r = await recoverFromStaleLock(supabase, {
        type: 400,
        description: built.payload.description!,
        since: st.since,
        amount: built.amountTotal,
      });
      if (r.kind === "one") return finalizeReceipt(supabase, b, p.green_invoice_receipt_id!, r.doc, built, true);
      if (r.kind === "many") return { ok: false, code: "ambiguous", message: MANY_CANDIDATES_MESSAGE };
    } catch (e) {
      return failFrom(e, "בדיקת הפקה קודמת נכשלה");
    }
  }
  const claimed = await conditionalUpdate(supabase, "payments", p.id, "green_invoice_receipt_id", p.green_invoice_receipt_id, {
    green_invoice_receipt_id: marker,
  });
  if (claimed.error) return { ok: false, code: "db_error", message: claimed.error };
  if (!claimed.ok) return { ok: false, code: "in_progress", message: "התשלום עודכן במקביל — רעננו את הדף" };
  const release = () =>
    conditionalUpdate(supabase, "payments", p.id, "green_invoice_receipt_id", marker, { green_invoice_receipt_id: null });

  try {
    const client = await findOrCreateClient(p.customer_id, b.customer);
    built = buildReceiptFor(b, client.id, emails, input);
  } catch (e) {
    await release();
    return failFrom(e, "איתור הלקוח ב-Green Invoice נכשל");
  }
  let doc: GiCreatedDocument;
  try {
    doc = await createDocument(built.payload);
  } catch (e) {
    const f = failFrom(e, "הפקת הקבלה נכשלה");
    if (f.code === "ambiguous" || !isGreenInvoiceError(e)) {
      return { ok: false, code: "ambiguous", message: ambiguousMessage("הקבלה") };
    }
    await release();
    return f;
  }
  return finalizeReceipt(supabase, b, marker, doc, built);
}

async function finalizeReceipt(
  supabase: Supa,
  b: PaymentBundle,
  marker: string,
  doc: GiCreatedDocument,
  built: BuiltDocument,
  recovered = false
): Promise<GiResult<{ document: GiExistingDocument }>> {
  const p = b.payment;
  const url = documentUrl(doc);
  const warnings: string[] = [];
  const upd = await conditionalUpdate(supabase, "payments", p.id, "green_invoice_receipt_id", marker, {
    green_invoice_receipt_id: doc.id,
    green_invoice_receipt_number: String(doc.number),
    green_invoice_url: url,
  });
  if (!upd.ok) warnings.push(`הקבלה הופקה (מס׳ ${doc.number}) אך שמירתה בתשלום נכשלה${upd.error ? `: ${upd.error}` : ""}`);
  const w = await insertDocumentRow(supabase, {
    kind: "customer_receipt",
    doc,
    built,
    customerId: p.customer_id,
    customer: b.customer,
    paymentId: p.id,
    // קבלה לתעודה אחת → מקשרים גם לתעודה
    deliveryId: b.deliveries.length === 1 ? b.deliveries[0].id : null,
    notes: `תשלום ${p.payment_number}${b.deliveries.length ? ` · תעודות ${b.deliveries.map((x) => x.number).join(", ")}` : ""}`,
  });
  if (w) warnings.push(w);
  if (!p.document_id) {
    // קישור מסמך הקבלה לתשלום (payments.document_id) — רק אם אין מסמך מקושר
    const { data: docRow } = await supabase.from("documents").select("id").eq("green_invoice_id", doc.id).limit(1);
    const docId = (docRow ?? [])[0]?.id as string | undefined;
    if (docId) await supabase.from("payments").update({ document_id: docId }).eq("id", p.id).is("document_id", null);
  }
  revalidateAll();
  return {
    ok: true,
    message: recovered
      ? `קבלה מס׳ ${doc.number} כבר הופקה בניסיון הקודם (נמצאה ב-Green Invoice) ונשמרה — לא הופקה שוב`
      : `קבלה מס׳ ${doc.number} הופקה ב-Green Invoice${built.payload.attachment ? " ונשלחה במייל" : ""}`,
    warning: warnings.length ? warnings.join("\n") : undefined,
    document: { greenInvoiceId: doc.id, type: 400, typeLabel: GI_DOCUMENT_TYPE_LABELS[400], number: String(doc.number), url },
  };
}

// =============================================================================
// הוצאות
// =============================================================================
export type ExpenseDialogData = {
  configured: boolean;
  env: GreenInvoiceEnv;
  expense: {
    id: string;
    documentNumber: string | null;
    documentType: number;
    expenseDate: string;
    amountTotal: number;
    vatAmount: number | null;
    supplierName: string | null;
    description: string | null;
    category: ExpenseCategoryDb;
  };
  existingId: string | null;
  greenInvoiceStatus: number | null;
  inProgress: boolean;
  recovering: boolean;
  hasFile: boolean;
  fileName: string | null;
  /** null = מוכן לשליחה */
  blocker: string | null;
  appUrl: string | null;
};

type ExpenseBundle = {
  expense: ExpenseViewRow;
  supplier: {
    id: string;
    name: string;
    tax_id: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    green_invoice_supplier_id: string | null;
  } | null;
  file: { storage_path: string; file_name: string | null; mime_type: string | null } | null;
};

async function loadExpenseBundle(supabase: Supa, expenseId: string): Promise<ExpenseBundle | GiFailure> {
  const { data: e, error } = await supabase.from("expenses_view").select("*").eq("id", expenseId).maybeSingle();
  if (error) return { ok: false, code: "db_error", message: toHebrewError(error) };
  if (!e) return { ok: false, code: "invalid", message: "ההוצאה לא נמצאה" };
  const expense = e as ExpenseViewRow;
  let supplier: ExpenseBundle["supplier"] = null;
  if (expense.supplier_id) {
    const { data: s, error: sErr } = await supabase
      .from("suppliers")
      .select("id, name, tax_id, email, phone, address, green_invoice_supplier_id")
      .eq("id", expense.supplier_id)
      .maybeSingle();
    if (sErr) return { ok: false, code: "db_error", message: toHebrewError(sErr) };
    supplier = (s as ExpenseBundle["supplier"]) ?? null;
  }
  let file: ExpenseBundle["file"] = null;
  if (expense.document_id) {
    const { data: doc } = await supabase
      .from("documents")
      .select("storage_path, file_name, mime_type")
      .eq("id", expense.document_id)
      .maybeSingle();
    const dd = doc as { storage_path: string | null; file_name: string | null; mime_type: string | null } | null;
    if (dd?.storage_path) file = { storage_path: dd.storage_path, file_name: dd.file_name, mime_type: dd.mime_type };
  }
  return { expense, supplier, file };
}

function expenseBlocker(b: ExpenseBundle): string | null {
  if (!b.supplier) return "להוצאה לא משויך ספק — Green Invoice דורש פרטי ספק";
  if (!b.expense.document_number?.trim()) return "חסר מספר מסמך (מספר החשבונית של הספק)";
  if (b.expense.expense_date > israelToday()) return "תאריך ההוצאה עתידי";
  return null;
}

export async function getExpenseDialogData(expenseId: string): Promise<GiResult<{ data: ExpenseDialogData }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, code: "auth", message: auth.message };
  if (!uuid.safeParse(expenseId).success) return { ok: false, code: "invalid", message: "מזהה לא תקין" };
  const b = await loadExpenseBundle(auth.supabase, expenseId);
  if ("ok" in b) return b;
  const e = b.expense;
  const st = parseGiId(e.green_invoice_expense_id);
  const cfg = getGreenInvoiceConfig();
  return {
    ok: true,
    message: "",
    data: {
      configured: !!cfg,
      env: resolveGreenInvoiceEnv(),
      expense: {
        id: e.id,
        documentNumber: e.document_number,
        documentType: e.document_type,
        expenseDate: e.expense_date,
        amountTotal: Number(e.amount_total),
        vatAmount: e.vat_amount === null ? null : Number(e.vat_amount),
        supplierName: e.supplier_name,
        description: e.description,
        category: e.category,
      },
      existingId: st.state === "issued" ? st.id : null,
      greenInvoiceStatus: e.green_invoice_status,
      inProgress: st.state === "pending" && !st.stale,
      recovering: st.state === "pending" && st.stale,
      hasFile: !!b.file,
      fileName: b.file?.file_name ?? null,
      blocker: expenseBlocker(b),
      appUrl: cfg ? `${cfg.appUrl}/expenses` : null,
    },
  };
}

/** רשימת סיווגי הנהלת חשבונות (במטמון 6 שעות) */
export async function listExpenseClassifications(
  opts: { refresh?: boolean } = {}
): Promise<GiResult<{ items: GiAccountingClassification[] }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, code: "auth", message: auth.message };
  if (!isGreenInvoiceConfigured()) return notConfigured();
  try {
    const items = await listClassifications({ force: !!opts.refresh });
    if (!items.length) {
      return { ok: false, code: "gi_error", message: "לא נמצאו סיווגי הוצאות בחשבון Green Invoice" };
    }
    return { ok: true, message: "", items };
  } catch (e) {
    return failFrom(e, "טעינת סיווגי ההוצאות נכשלה");
  }
}

const pushExpenseSchema = z.object({ classificationId: z.string().trim().min(1, "יש לבחור סיווג").max(100) });

export async function pushExpenseToGreenInvoice(
  expenseId: string,
  raw: { classificationId: string }
): Promise<GiResult<{ greenInvoiceExpenseId: string; fileAttached: boolean }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, code: "auth", message: auth.message };
  if (!isGreenInvoiceConfigured()) return notConfigured();
  const parsed = pushExpenseSchema.safeParse(raw);
  if (!uuid.safeParse(expenseId).success) return { ok: false, code: "invalid", message: "מזהה לא תקין" };
  if (!parsed.success) return { ok: false, code: "invalid", message: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" };
  const supabase = auth.supabase;
  const b = await loadExpenseBundle(supabase, expenseId);
  if ("ok" in b) return b;
  const e = b.expense;
  const st = parseGiId(e.green_invoice_expense_id);
  if (st.state === "issued") {
    return { ok: false, code: "already_issued", message: "ההוצאה כבר נשלחה ל-Green Invoice — לא שולחים פעמיים" };
  }
  if (st.state === "pending" && !st.stale) {
    return { ok: false, code: "in_progress", message: "שליחת ההוצאה כבר מתבצעת — המתינו ורעננו את הדף" };
  }
  const blocker = expenseBlocker(b);
  if (blocker) return { ok: false, code: "invalid", message: blocker };

  let classification: GiAccountingClassification | { id: string } = { id: parsed.data.classificationId };
  try {
    const all = await listClassifications();
    const hit = all.find((c) => c.id === parsed.data.classificationId);
    if (hit) classification = hit;
  } catch {
    // ממשיכים עם { id } בלבד
  }
  const expenseInput = {
    document_type: e.document_type,
    document_number: e.document_number,
    expense_date: e.expense_date,
    reporting_month: e.reporting_month,
    amount_total: Number(e.amount_total),
    amount_before_vat: e.amount_before_vat === null ? null : Number(e.amount_before_vat),
    vat_amount: e.vat_amount === null ? null : Number(e.vat_amount),
    currency: e.currency,
    is_paid: e.is_paid,
    payment_method: e.payment_method,
    description: e.description,
    notes: e.notes,
  };
  const fallbackDescription = expenseCategoryLabels[e.category];
  try {
    buildExpensePayload({ expense: expenseInput, supplier: b.supplier, classification, fallbackDescription });
  } catch (err) {
    return failFrom(err, "בניית ההוצאה");
  }

  const marker = makePendingMarker();
  if (st.state === "pending") {
    try {
      const found = await findRecentExpenses({ number: e.document_number!.trim(), supplierId: b.supplier?.green_invoice_supplier_id });
      if (found.length === 1) {
        return finalizeExpense(supabase, b, e.green_invoice_expense_id!, found[0].id, found[0].status ?? 10);
      }
      if (found.length > 1) {
        return { ok: false, code: "ambiguous", message: "נמצאו כמה הוצאות עם אותו מספר ב-Green Invoice — בדקו שם ידנית" };
      }
    } catch (err) {
      return failFrom(err, "בדיקת שליחה קודמת נכשלה");
    }
  }
  const claimed = await conditionalUpdate(supabase, "expenses", e.id, "green_invoice_expense_id", e.green_invoice_expense_id, {
    green_invoice_expense_id: marker,
  });
  if (claimed.error) return { ok: false, code: "db_error", message: claimed.error };
  if (!claimed.ok) return { ok: false, code: "in_progress", message: "ההוצאה עודכנה במקביל — רעננו את הדף" };
  const release = () =>
    conditionalUpdate(supabase, "expenses", e.id, "green_invoice_expense_id", marker, { green_invoice_expense_id: null });

  let created: { id: string; status?: number };
  try {
    const sup = b.supplier!;
    const giSupplier = await findOrCreateSupplier(sup);
    if (!sup.green_invoice_supplier_id) {
      await supabase
        .from("suppliers")
        .update({ green_invoice_supplier_id: giSupplier.id })
        .eq("id", sup.id)
        .is("green_invoice_supplier_id", null);
    }
    const payload = buildExpensePayload({
      expense: expenseInput,
      supplier: { ...sup, green_invoice_supplier_id: giSupplier.id },
      classification,
      fallbackDescription,
    });
    try {
      created = await createExpense(payload);
    } catch (err) {
      const f = failFrom(err, "שליחת ההוצאה נכשלה");
      if (f.code === "ambiguous" || !isGreenInvoiceError(err)) {
        return { ok: false, code: "ambiguous", message: ambiguousMessage("ההוצאה") };
      }
      await release();
      return f;
    }
  } catch (err) {
    await release();
    return failFrom(err, "איתור הספק ב-Green Invoice נכשל");
  }
  return finalizeExpense(supabase, b, marker, created.id, created.status ?? 10);
}

async function finalizeExpense(
  supabase: Supa,
  b: ExpenseBundle,
  marker: string,
  giExpenseId: string,
  status: number
): Promise<GiResult<{ greenInvoiceExpenseId: string; fileAttached: boolean }>> {
  const warnings: string[] = [];
  const upd = await conditionalUpdate(supabase, "expenses", b.expense.id, "green_invoice_expense_id", marker, {
    green_invoice_expense_id: giExpenseId,
    green_invoice_status: status,
  });
  if (!upd.ok) warnings.push(`ההוצאה נוצרה ב-Green Invoice אך שמירת המזהה נכשלה${upd.error ? `: ${upd.error}` : ""} — ${giExpenseId}`);

  let fileAttached = false;
  if (b.file) {
    try {
      const { data: blob, error } = await supabase.storage.from("documents").download(b.file.storage_path);
      if (error || !blob) throw new Error(toHebrewError(error, "הורדת הקובץ מהאחסון נכשלה"));
      const name = b.file.file_name || b.file.storage_path.split("/").pop() || "document.pdf";
      const typed = b.file.mime_type && blob.type !== b.file.mime_type ? new Blob([blob], { type: b.file.mime_type }) : blob;
      await attachFileToExpense(giExpenseId, typed, name);
      fileAttached = true;
    } catch (err) {
      const env = resolveGreenInvoiceEnv();
      const reason = isGreenInvoiceError(err) ? err.errorMessage : err instanceof Error ? err.message : "שגיאה";
      const sandboxNote =
        env === "sandbox" && isGreenInvoiceError(err) && (err.kind === "network" || err.kind === "timeout")
          ? " (שירות העלאת הקבצים של סביבת הבדיקות לא זמין מהשרת — אפשר להגדיר GREEN_INVOICE_UPLOAD_URL)"
          : "";
      warnings.push(`ההוצאה נוצרה, אך צירוף הקובץ נכשל: ${reason}${sandboxNote} — צרפו את הקובץ ידנית ב-Green Invoice`);
    }
  }
  revalidateAll();
  return {
    ok: true,
    message: fileAttached ? "ההוצאה נשלחה ל-Green Invoice והקובץ צורף" : "ההוצאה נשלחה ל-Green Invoice",
    warning: warnings.length ? warnings.join("\n") : undefined,
    greenInvoiceExpenseId: giExpenseId,
    fileAttached,
  };
}

// =============================================================================
// סטטוס חיבור
// =============================================================================
export type ConnectionStatus = {
  configured: boolean;
  env: GreenInvoiceEnv;
  missing: string[];
  apiHost: string | null;
  tokenOk: boolean | null;
  businessName: string | null;
  nextInvoiceNumber: number | null;
  vatRate: number | null;
  error: string | null;
  checkedAt: string;
};

/** בודק חיבור: טוקן → businesses/me (לא מתועד, לא חובה) → documents/info?type=305 (מתועד) */
export async function getConnectionStatus(): Promise<GiResult<{ status: ConnectionStatus }>> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, code: "auth", message: auth.message };
  const cfg = getGreenInvoiceConfig();
  const status: ConnectionStatus = {
    configured: !!cfg,
    env: resolveGreenInvoiceEnv(),
    missing: missingGreenInvoiceVars(),
    apiHost: cfg ? new URL(cfg.apiUrl).host : null,
    tokenOk: null,
    businessName: null,
    nextInvoiceNumber: null,
    vatRate: null,
    error: null,
    checkedAt: new Date().toISOString(),
  };
  if (!cfg) return { ok: true, message: NOT_CONFIGURED_MESSAGE, status };
  try {
    await getAccessToken({ force: true });
    status.tokenOk = true;
  } catch (e) {
    status.tokenOk = false;
    status.error = isGreenInvoiceError(e) ? e.errorMessage : "ההתחברות נכשלה";
    return { ok: true, message: status.error, status };
  }
  status.businessName = await getBusinessName();
  try {
    const info = await getDocumentInfo(305);
    status.nextInvoiceNumber = typeof info?.number === "number" ? info.number : null;
    status.vatRate = typeof info?.vatRate === "number" ? info.vatRate : null;
  } catch (e) {
    status.error = isGreenInvoiceError(e) ? e.errorMessage : "בדיקת הגדרות המסמכים נכשלה";
  }
  return { ok: true, message: status.error ?? "החיבור תקין", status };
}
