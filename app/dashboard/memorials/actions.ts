"use server";

import { revalidatePath } from "next/cache";

import { z } from "@/lib/zod-he";
import { requireAdmin, requireAuth } from "@/lib/supabase/auth-helpers";
import { toHebrewError } from "@/lib/db/errors";
import { optionalDateSchema } from "@/lib/db/validation";
import {
  MEM_DOC_TYPE_LABELS,
  MEM_DOC_TYPES,
  MEM_LEAD_STATUSES,
  MEM_ORDER_KINDS,
  MEM_PAYMENT_METHODS,
  MEM_STAGES,
  type MemDocType,
  type MemPaymentMethod,
} from "@/lib/memorials/constants";
import { buildDocumentPayload, emptyDocumentModel, israelTodayIso } from "@/lib/green-invoice/document-builder";
import { createDocument, documentUrl, getDocumentInfo } from "@/lib/green-invoice/service";
import type { GiPaymentType } from "@/lib/green-invoice/document-types";
import { isGreenInvoiceError } from "@/lib/green-invoice/errors";

type Ok<T = object> = { ok: true } & T;
type Fail = { ok: false; message: string };

const BASE = "/dashboard/memorials";

function revalidateMemorials(...extra: string[]) {
  revalidatePath(BASE, "layout");
  for (const p of extra) revalidatePath(p);
}

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v ?? null),
    z.string().max(max).nullable()
  );

const optionalMoney = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(/[,₪\s]/g, ""))),
  z.number().min(0, "הסכום לא יכול להיות שלילי").max(10_000_000).nullable()
);

const phoneSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/[^\d+]/g, "") : v),
  z.string().regex(/^(\+?972|0)\d{8,9}$/, "מספר טלפון לא תקין").nullable().or(z.literal(""))
);

// ---------------------------------------------------------------------------
// לידים
// ---------------------------------------------------------------------------
const manualLeadSchema = z.object({
  name: z.string().trim().min(2, "יש למלא שם").max(120),
  phone: phoneSchema,
  email: optionalText(200),
  message: optionalText(4000),
  deceased_name: optionalText(200),
  death_date: optionalDateSchema,
  source: z.enum(["phone", "manual", "other"]).default("phone"),
});

export async function createManualLead(input: unknown): Promise<Ok<{ id: string }> | Fail> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  const parsed = manualLeadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" };
  const v = parsed.data;
  const { data, error } = await auth.supabase
    .from("mem_leads")
    .insert({
      name: v.name,
      phone: v.phone || null,
      email: v.email,
      message: v.message,
      deceased_name: v.deceased_name,
      death_date: v.death_date ?? null,
      source: v.source,
      status: "contacted",
      first_contact_at: new Date().toISOString(),
      assigned_to: auth.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: toHebrewError(error) };
  // מי שהזין את הליד לא צריך לקבל עליו דיווח
  await auth.supabase.from("mem_lead_reports").insert({ lead_id: data.id, user_id: auth.userId });
  revalidateMemorials();
  return { ok: true, id: data.id };
}

export async function setLeadStatus(
  id: string,
  status: string,
  lostReason?: string | null
): Promise<Ok | Fail> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  if (!(MEM_LEAD_STATUSES as readonly string[]).includes(status)) return { ok: false, message: "סטטוס לא תקין" };
  const patch: Record<string, unknown> = { status };
  if (status === "lost") patch.lost_reason = lostReason?.trim() || null;
  if (status !== "new") {
    const { data: cur } = await auth.supabase.from("mem_leads").select("first_contact_at").eq("id", id).single();
    if (cur && !cur.first_contact_at) patch.first_contact_at = new Date().toISOString();
    patch.assigned_to = auth.userId;
  }
  const { error } = await auth.supabase.from("mem_leads").update(patch).eq("id", id);
  if (error) return { ok: false, message: toHebrewError(error) };
  revalidateMemorials(`${BASE}/leads/${id}`);
  return { ok: true };
}

export async function updateLeadNotes(id: string, notes: string): Promise<Ok | Fail> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  const { error } = await auth.supabase
    .from("mem_leads")
    .update({ notes: notes.trim() || null })
    .eq("id", id);
  if (error) return { ok: false, message: toHebrewError(error) };
  revalidatePath(`${BASE}/leads/${id}`);
  return { ok: true };
}

/** אינסטינקט / משתמש: "דיווחתי על הלידים האלה" — לכל משתמש בנפרד */
export async function markLeadsReported(ids: string[]): Promise<Ok<{ count: number }> | Fail> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  const clean = [...new Set(ids.filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))];
  if (!clean.length) return { ok: true, count: 0 };
  const { error } = await auth.supabase
    .from("mem_lead_reports")
    .upsert(
      clean.map((lead_id) => ({ lead_id, user_id: auth.userId })),
      { onConflict: "lead_id,user_id", ignoreDuplicates: true }
    );
  if (error) return { ok: false, message: toHebrewError(error) };
  revalidateMemorials();
  return { ok: true, count: clean.length };
}

export async function convertLeadToOrder(
  leadId: string,
  kind: string
): Promise<Ok<{ id: string }> | Fail> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  if (!(MEM_ORDER_KINDS as readonly string[]).includes(kind)) return { ok: false, message: "סוג הזמנה לא תקין" };
  const { data: lead, error: le } = await auth.supabase
    .from("mem_leads")
    .select("id, name, phone, email, deceased_name, death_date, design_code, design_url, message, summary, order_id, first_contact_at")
    .eq("id", leadId)
    .single();
  if (le || !lead) return { ok: false, message: toHebrewError(le, "הליד לא נמצא") };
  if (lead.order_id) return { ok: true, id: lead.order_id };

  const notes = [lead.summary, lead.message].filter(Boolean).join("\n\n") || null;
  const { data: order, error } = await auth.supabase
    .from("mem_orders")
    .insert({
      lead_id: lead.id,
      kind,
      stage: "call",
      customer_name: lead.name,
      phone: lead.phone,
      email: lead.email,
      deceased_name: lead.deceased_name,
      death_date: lead.death_date,
      design_code: lead.design_code,
      design_url: lead.design_url,
      notes,
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !order) return { ok: false, message: toHebrewError(error) };

  await auth.supabase
    .from("mem_leads")
    .update({
      status: "converted",
      order_id: order.id,
      first_contact_at: lead.first_contact_at ?? new Date().toISOString(),
    })
    .eq("id", lead.id);
  // תמונת העיצוב מהאתר משויכת גם להזמנה
  await auth.supabase.from("mem_images").update({ order_id: order.id }).eq("lead_id", lead.id).is("order_id", null);

  revalidateMemorials(`${BASE}/leads/${leadId}`);
  return { ok: true, id: order.id };
}

export async function deleteLead(id: string): Promise<Ok | Fail> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { error } = await auth.supabase.from("mem_leads").delete().eq("id", id);
  if (error) return { ok: false, message: toHebrewError(error) };
  revalidateMemorials();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// הזמנות
// ---------------------------------------------------------------------------
const orderSchema = z.object({
  kind: z.enum(MEM_ORDER_KINDS),
  customer_name: z.string().trim().min(2, "יש למלא שם לקוח").max(120),
  phone: phoneSchema,
  email: optionalText(200),
  address: optionalText(300),
  city: optionalText(100),
  deceased_name: optionalText(200),
  death_date: optionalDateSchema,
  hebrew_death_date: optionalText(100),
  cemetery: optionalText(200),
  grave_location: optionalText(200),
  price: optionalMoney,
  deposit_amount: optionalMoney,
  design_url: optionalText(4000),
  wording: optionalText(4000),
  installation_date: optionalDateSchema,
  notes: optionalText(4000),
});

function orderPatch(v: z.infer<typeof orderSchema>) {
  return {
    ...v,
    phone: v.phone || null,
    death_date: v.death_date ?? null,
    installation_date: v.installation_date ?? null,
  };
}

export async function createOrder(input: unknown): Promise<Ok<{ id: string }> | Fail> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" };
  const { data, error } = await auth.supabase
    .from("mem_orders")
    .insert({ ...orderPatch(parsed.data), created_by: auth.userId })
    .select("id")
    .single();
  if (error) return { ok: false, message: toHebrewError(error) };
  revalidateMemorials();
  return { ok: true, id: data.id };
}

export async function updateOrder(id: string, input: unknown): Promise<Ok<{ id: string }> | Fail> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" };
  const { error } = await auth.supabase.from("mem_orders").update(orderPatch(parsed.data)).eq("id", id);
  if (error) return { ok: false, message: toHebrewError(error) };
  revalidateMemorials(`${BASE}/orders/${id}`);
  return { ok: true, id };
}

export async function setOrderStage(id: string, stage: string, cancelReason?: string | null): Promise<Ok | Fail> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  if (!(MEM_STAGES as readonly string[]).includes(stage)) return { ok: false, message: "שלב לא תקין" };
  const patch: Record<string, unknown> = { stage };
  if (stage === "cancelled") patch.cancel_reason = cancelReason?.trim() || null;
  const { error } = await auth.supabase.from("mem_orders").update(patch).eq("id", id);
  if (error) return { ok: false, message: toHebrewError(error) };
  revalidateMemorials(`${BASE}/orders/${id}`);
  return { ok: true };
}

export async function deleteOrder(id: string): Promise<Ok | Fail> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { count } = await auth.supabase
    .from("mem_documents")
    .select("id", { count: "exact", head: true })
    .eq("order_id", id)
    .eq("status", "issued");
  if (count) return { ok: false, message: "להזמנה יש מסמכי Morning — לא ניתן למחוק. אפשר לסמן אותה כבוטלה." };
  const { error } = await auth.supabase.from("mem_orders").delete().eq("id", id);
  if (error) return { ok: false, message: toHebrewError(error) };
  revalidateMemorials();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// תמונות (הדמיה סופית וכו׳) — הקובץ מוקטן בדפדפן ונשלח כ-base64
// ---------------------------------------------------------------------------
export async function uploadOrderImage(
  orderId: string,
  input: { base64: string; mime: string; kind: "render" | "design" | "other" }
): Promise<Ok<{ id: string }> | Fail> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  if (!["image/jpeg", "image/png", "image/webp"].includes(input.mime)) return { ok: false, message: "סוג קובץ לא נתמך" };
  if (!["render", "design", "other"].includes(input.kind)) return { ok: false, message: "סוג תמונה לא תקין" };
  const buf = Buffer.from(input.base64.replace(/^data:[^;]+;base64,/, ""), "base64");
  if (buf.length < 100 || buf.length > 3_000_000) return { ok: false, message: "התמונה גדולה מדי (עד 3MB)" };
  const { data, error } = await auth.supabase
    .from("mem_images")
    .insert({
      order_id: orderId,
      kind: input.kind,
      mime: input.mime,
      bytes: buf.length,
      data: `\\x${buf.toString("hex")}`,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: toHebrewError(error) };
  revalidatePath(`${BASE}/orders/${orderId}`);
  return { ok: true, id: data.id };
}

export async function deleteImage(id: string, orderId: string): Promise<Ok | Fail> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  const { error } = await auth.supabase.from("mem_images").delete().eq("id", id).neq("kind", "signature");
  if (error) return { ok: false, message: toHebrewError(error) };
  revalidatePath(`${BASE}/orders/${orderId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// אישור נוסח דיגיטלי
// ---------------------------------------------------------------------------
export async function createApproval(
  orderId: string,
  input: { wording: string; imageId: string | null }
): Promise<Ok<{ id: string; token: string }> | Fail> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  const wording = input.wording.trim();
  if (wording.length < 2) return { ok: false, message: "יש להזין את נוסח המצבה" };
  if (wording.length > 4000) return { ok: false, message: "הנוסח ארוך מדי" };
  // בקשות פתוחות קודמות מבוטלות — תמיד יש קישור אחד בתוקף
  await auth.supabase
    .from("mem_approvals")
    .update({ status: "cancelled" })
    .eq("order_id", orderId)
    .eq("status", "pending");
  const { data, error } = await auth.supabase
    .from("mem_approvals")
    .insert({ order_id: orderId, wording, image_id: input.imageId, created_by: auth.userId })
    .select("id, token")
    .single();
  if (error) return { ok: false, message: toHebrewError(error) };
  await auth.supabase.from("mem_orders").update({ wording }).eq("id", orderId);
  revalidatePath(`${BASE}/orders/${orderId}`);
  return { ok: true, id: data.id, token: data.token };
}

export async function cancelApproval(id: string, orderId: string): Promise<Ok | Fail> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  const { error } = await auth.supabase
    .from("mem_approvals")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { ok: false, message: toHebrewError(error) };
  revalidatePath(`${BASE}/orders/${orderId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// תשלומים
// ---------------------------------------------------------------------------
const paymentSchema = z.object({
  amount: z.preprocess((v) => Number(String(v ?? "").replace(/[,₪\s]/g, "")), z.number().positive("יש להזין סכום")),
  method: z.enum(MEM_PAYMENT_METHODS),
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין"),
  is_deposit: z.boolean().default(false),
  note: optionalText(500),
});

export async function addPayment(orderId: string, input: unknown): Promise<Ok<{ id: string }> | Fail> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" };
  const { data, error } = await auth.supabase
    .from("mem_payments")
    .insert({ ...parsed.data, order_id: orderId, created_by: auth.userId })
    .select("id")
    .single();
  if (error) return { ok: false, message: toHebrewError(error) };
  // מקדמה ראשונה מקדמת את ההזמנה לשלב "מקדמה" אם היא עוד לפניו
  if (parsed.data.is_deposit) {
    await auth.supabase
      .from("mem_orders")
      .update({ stage: "deposit" })
      .eq("id", orderId)
      .in("stage", ["call", "quote"]);
  }
  revalidateMemorials(`${BASE}/orders/${orderId}`);
  return { ok: true, id: data.id };
}

export async function deletePayment(id: string, orderId: string): Promise<Ok | Fail> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { data: p } = await auth.supabase.from("mem_payments").select("document_id").eq("id", id).single();
  if (p?.document_id) return { ok: false, message: "לתשלום הופק מסמך ב-Morning — לא ניתן למחוק" };
  const { error } = await auth.supabase.from("mem_payments").delete().eq("id", id);
  if (error) return { ok: false, message: toHebrewError(error) };
  revalidatePath(`${BASE}/orders/${orderId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// מסמכי Morning
// ---------------------------------------------------------------------------
const GI_PAYMENT_TYPE_BY_METHOD: Record<MemPaymentMethod, GiPaymentType | null> = {
  cash: 1,
  cheque: null, // צ׳ק דורש פרטי בנק — מפיקים מהמסך המלא של Morning
  card: 3,
  transfer: 4,
  app: 10,
  other: 11,
};

const docSchema = z.object({
  doc_type: z.preprocess((v) => Number(v), z.number().refine((n) => (MEM_DOC_TYPES as readonly number[]).includes(n), "סוג מסמך לא תקין")),
  amount: z.preprocess((v) => Number(String(v ?? "").replace(/[,₪\s]/g, "")), z.number().positive("יש להזין סכום")),
  description: z.string().trim().min(2, "יש להזין תיאור").max(300),
  payment_id: optionalText(64),
  method: z.enum(MEM_PAYMENT_METHODS).nullable().optional(),
  send_email: z.boolean().default(true),
});

export async function issueMorningDocument(
  orderId: string,
  input: unknown
): Promise<Ok<{ url: string | null; number: string }> | Fail> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  const parsed = docSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" };
  const v = parsed.data;
  const docType = v.doc_type as MemDocType;
  const label = MEM_DOC_TYPE_LABELS[docType];

  const { data: order, error: oe } = await auth.supabase
    .from("mem_orders")
    .select("id, number, stage, customer_name, phone, email, address, city")
    .eq("id", orderId)
    .single();
  if (oe || !order) return { ok: false, message: toHebrewError(oe, "ההזמנה לא נמצאה") };

  const { data: docs } = await auth.supabase
    .from("mem_documents")
    .select("id, doc_type, morning_id, amount, status, created_at")
    .eq("order_id", orderId)
    .eq("status", "issued")
    .order("created_at", { ascending: false });
  const issued = docs ?? [];

  let linkedIds: string[] = [];
  let linkType: "cancel" | "link" | "" = "";

  if (docType === 330) {
    if (!auth.isAdmin) return { ok: false, message: "חשבונית זיכוי — למנהל בלבד" };
    if (order.stage !== "cancelled") return { ok: false, message: "חשבונית זיכוי מופקת רק להזמנה שבוטלה" };
    const { data: pays } = await auth.supabase.from("mem_payments").select("amount").eq("order_id", orderId);
    const paid = (pays ?? []).reduce((s, p) => s + Number(p.amount), 0);
    if (paid <= 0) return { ok: false, message: "חשבונית זיכוי מופקת רק אם הלקוח כבר שילם" };
    const base = issued.find((d) => (d.doc_type === 320 || d.doc_type === 305) && d.morning_id);
    if (!base) return { ok: false, message: "לא נמצאה חשבונית מס / חשבונית מס קבלה לזיכוי בהזמנה זו" };
    linkedIds = [base.morning_id!];
    linkType = "cancel";
  }

  let method: MemPaymentMethod | null = v.method ?? null;
  let paidAt = israelTodayIso();
  let paymentId: string | null = null;
  if (docType === 320 || docType === 400) {
    if (v.payment_id) {
      const { data: pay } = await auth.supabase
        .from("mem_payments")
        .select("id, amount, method, paid_at, document_id")
        .eq("id", v.payment_id)
        .eq("order_id", orderId)
        .single();
      if (!pay) return { ok: false, message: "התשלום לא נמצא" };
      if (pay.document_id) return { ok: false, message: "לתשלום הזה כבר הופק מסמך" };
      method = pay.method as MemPaymentMethod;
      paidAt = pay.paid_at;
      paymentId = pay.id;
      if (Math.abs(Number(pay.amount) - v.amount) > 0.009) {
        return { ok: false, message: "הסכום במסמך חייב להיות שווה לסכום התשלום" };
      }
    }
    if (!method) return { ok: false, message: "יש לבחור אמצעי תשלום" };
    if (GI_PAYMENT_TYPE_BY_METHOD[method] === null) {
      return { ok: false, message: "לתשלום בצ׳ק יש להפיק מסמך מהמסך המלא של Morning (נדרשים פרטי בנק)" };
    }
    // קודם מקשרים לחשבונית העסקה (אם קיימת)
    const deal = issued.find((d) => d.doc_type === 300 && d.morning_id);
    if (deal && !linkedIds.length) {
      linkedIds = [deal.morning_id!];
      linkType = "link";
    }
  }

  const model = emptyDocumentModel(docType);
  model.description = `${label} — הזמנה פרטית #${order.number}`;
  model.client = {
    id: null,
    name: order.customer_name,
    emails: v.send_email && order.email ? [order.email] : [],
    phone: order.phone ?? undefined,
    mobile: order.phone ?? undefined,
    address: order.address ?? undefined,
    city: order.city ?? undefined,
    country: "IL",
    add: true,
  };
  model.attachment = !!(v.send_email && order.email);
  if (docType !== 400) {
    // מחיר ללקוח פרטי כולל מע״מ
    model.income = [{ description: v.description, quantity: 1, price: v.amount, vatType: 1 }];
  } else {
    model.income = [];
  }
  if (docType === 320 || docType === 400) {
    const type = GI_PAYMENT_TYPE_BY_METHOD[method!]!;
    model.payment = [
      {
        type,
        date: paidAt,
        price: v.amount,
        ...(type === 11 ? { subType: 9 } : {}),
      },
    ];
  }
  if (linkedIds.length) {
    model.linkedDocumentIds = linkedIds;
    model.linkType = linkType || "link";
  }

  let lastDocumentDate: string | undefined;
  try {
    lastDocumentDate = (await getDocumentInfo(docType)).lastDocumentDate;
  } catch {
    lastDocumentDate = undefined;
  }
  const built = buildDocumentPayload(model, { role: auth.role, lastDocumentDate });
  if (!built.ok) return { ok: false, message: built.issues[0]?.message ?? "המסמך לא תקין" };

  const { data: row, error: re } = await auth.supabase
    .from("mem_documents")
    .insert({
      order_id: orderId,
      doc_type: docType,
      amount: v.amount,
      description: v.description,
      status: "pending",
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (re || !row) return { ok: false, message: toHebrewError(re) };

  try {
    const doc = await createDocument(built.payload as never);
    const url = documentUrl(doc);
    await auth.supabase
      .from("mem_documents")
      .update({ status: "issued", morning_id: doc.id, morning_number: String(doc.number), url })
      .eq("id", row.id);
    if (paymentId) {
      await auth.supabase.from("mem_payments").update({ document_id: row.id }).eq("id", paymentId);
    }
    revalidatePath(`${BASE}/orders/${orderId}`);
    return { ok: true, url, number: String(doc.number) };
  } catch (e) {
    if (!isGreenInvoiceError(e) || e.ambiguous) {
      // לא ידוע אם הופק — לא מסמנים "נכשל" כדי שלא יופק פעמיים
      revalidatePath(`${BASE}/orders/${orderId}`);
      return {
        ok: false,
        message: "לא התקבלה תשובה מ-Morning בזמן — ייתכן שהמסמך הופק. בדקו ב-Morning לפני שמפיקים שוב.",
      };
    }
    const message = e.message || "הפקת המסמך נכשלה";
    await auth.supabase.from("mem_documents").update({ status: "failed", description: `${v.description} — ${message}`.slice(0, 300) }).eq("id", row.id);
    revalidatePath(`${BASE}/orders/${orderId}`);
    return { ok: false, message: `Morning: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// תזכורות
// ---------------------------------------------------------------------------
export async function completeReminder(id: string): Promise<Ok | Fail> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  const { error } = await auth.supabase
    .from("mem_reminders")
    .update({ done_at: new Date().toISOString(), done_by: auth.userId })
    .eq("id", id)
    .is("done_at", null);
  if (error) return { ok: false, message: toHebrewError(error) };
  revalidateMemorials();
  return { ok: true };
}

const reminderSchema = z.object({
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין"),
  title: z.string().trim().min(2, "יש להזין כותרת").max(300),
});

export async function addReminder(
  target: { orderId?: string; leadId?: string },
  input: unknown
): Promise<Ok | Fail> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  const parsed = reminderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" };
  if (!target.orderId && !target.leadId) return { ok: false, message: "חסר יעד לתזכורת" };
  const { error } = await auth.supabase.from("mem_reminders").insert({
    order_id: target.orderId ?? null,
    lead_id: target.leadId ?? null,
    kind: "custom",
    ...parsed.data,
  });
  if (error) return { ok: false, message: toHebrewError(error) };
  revalidateMemorials();
  return { ok: true };
}
