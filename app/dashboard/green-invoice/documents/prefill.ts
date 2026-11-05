import "server-only";

import type {
  DeliveryViewRow,
  DocumentViewRow,
  OrderItemViewRow,
  PaymentMethodDb,
  PaymentRow,
  QuoteItemViewRow,
} from "@/lib/db/types";
import { documentKindLabels } from "@/lib/db/labels";
import {
  buildIncomeRowsForDelivery,
  cleanEmails,
  israelToday,
  type CrmDeliveryLine,
  type CrmOrderCharge,
  type GiIncomeRow,
} from "@/lib/green-invoice/mappers";
import {
  GI_DOC_TYPE_DEFS,
  giDocTypeName,
  isGiDocType,
  suggestedLinkType,
  type GiDocType,
  type GiPaymentType,
} from "@/lib/green-invoice/document-types";
import {
  emptyDocumentModel,
  type DocFormModel,
  type DocIncomeRowModel,
  type DocPaymentRowModel,
} from "@/lib/green-invoice/document-builder";
import { getDocument } from "@/lib/green-invoice/service";
import { isGreenInvoiceConfigured } from "@/lib/green-invoice/config";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** לקוח / ספק לבחירה בטופס, עם הפרטים למילוי אוטומטי */
export type PartyOption = {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

/** מסמך מקושר שנבחר (מזהה Morning + תווית) */
export type LinkedPick = {
  greenInvoiceId: string;
  label: string;
  type: number | null;
  localDocumentId: string | null;
  url: string | null;
};

/** מקור למילוי שורות ההכנסה (תעודת משלוח / הזמנה / הצעה) */
export type IncomeSource = { kind: "delivery" | "order" | "quote"; id: string; label: string; rows: DocIncomeRowModel[] };

export type MorningFormPrefill = {
  model: DocFormModel;
  context: {
    customerId: string | null;
    supplierId: string | null;
    orderId: string | null;
    deliveryId: string | null;
    paymentId: string | null;
    quoteId: string | null;
    note: string | null;
  };
  linked: LinkedPick[];
  incomeSources: IncomeSource[];
  /** מה מילא את הטופס (לתצוגה) */
  sourceLabels: string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function asUuid(v: string | string[] | undefined | null): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && UUID_RE.test(s) ? s : null;
}

/** אמצעי תשלום CRM → PaymentGroup (אחר → 11, המשתמש בוחר סוג) */
const METHOD_TO_GI: Record<PaymentMethodDb, GiPaymentType> = {
  cash: 1,
  check: 2,
  credit_card: 3,
  bank_transfer: 4,
  other: 11,
};

function toRowModel(r: GiIncomeRow): DocIncomeRowModel {
  return {
    description: r.description,
    quantity: r.quantity,
    price: r.price,
    vatType: r.vatType,
    ...(r.vatRate !== undefined ? { vatRate: r.vatRate } : {}),
    ...(r.catalogNum ? { catalogNum: r.catalogNum } : {}),
  };
}

function docLabel(d: Pick<DocumentViewRow, "kind" | "document_number" | "green_invoice_type">): string {
  const kind = d.green_invoice_type ? giDocTypeName(d.green_invoice_type) : documentKindLabels[d.kind];
  return d.document_number ? `${kind} ${d.document_number}` : kind;
}

export async function loadParties(supabase: Supabase): Promise<{ customers: PartyOption[]; suppliers: PartyOption[] }> {
  const [{ data: customers }, { data: suppliers }] = await Promise.all([
    supabase.from("customers").select("id, name, tax_id, email, phone, address, is_active").order("name"),
    supabase.from("suppliers").select("id, name, tax_id, email, phone, address, is_active").order("name"),
  ]);
  const pick = (rows: (PartyOption & { is_active: boolean })[]) =>
    rows.filter((r) => r.is_active).map(({ is_active: _, ...r }) => r);
  return {
    customers: pick((customers ?? []) as never[]),
    suppliers: pick((suppliers ?? []) as never[]),
  };
}

async function loadCharges(supabase: Supabase, orderId: string): Promise<CrmOrderCharge[]> {
  const { data } = await supabase.from("order_charges").select("kind, description, amount, sort_order").eq("order_id", orderId);
  return ((data ?? []) as Record<string, unknown>[]).map((c) => ({
    kind: c.kind as CrmOrderCharge["kind"],
    description: String(c.description ?? ""),
    amount: Number(c.amount),
    sort_order: c.sort_order == null ? null : Number(c.sort_order),
  }));
}

async function deliverySource(supabase: Supabase, id: string): Promise<{ src: IncomeSource; delivery: DeliveryViewRow } | null> {
  const { data: d } = await supabase.from("deliveries_view").select("*").eq("id", id).maybeSingle();
  if (!d) return null;
  const delivery = d as DeliveryViewRow;
  const [{ data: items }, charges, { data: order }] = await Promise.all([
    supabase.from("delivery_items").select("*, inventory_items(pricing_unit)").eq("delivery_id", id),
    loadCharges(supabase, delivery.order_id),
    supabase.from("orders").select("vat_rate").eq("id", delivery.order_id).maybeSingle(),
  ]);
  const lines: CrmDeliveryLine[] = ((items ?? []) as Record<string, unknown>[]).map((row) => ({
    stone_name: String(row.stone_name ?? ""),
    length_m: Number(row.length_m),
    width_m: Number(row.width_m),
    height_m: Number(row.height_m),
    quantity: Number(row.quantity),
    volume_m3: Number(row.volume_m3),
    price_per_m3: Number(row.price_per_m3),
    line_subtotal: Number(row.line_subtotal),
    inventory_pricing_unit: (row.inventory_items as { pricing_unit?: "m3" | "m2" } | null)?.pricing_unit ?? "m3",
  }));
  const vatRate = order ? Number((order as { vat_rate: number }).vat_rate) : 0.18;
  const { rows } = buildIncomeRowsForDelivery(lines, charges, vatRate);
  return {
    delivery,
    src: { kind: "delivery", id, label: `תעודת משלוח #${delivery.delivery_number}`, rows: rows.map(toRowModel) },
  };
}

async function orderSource(
  supabase: Supabase,
  id: string
): Promise<{ src: IncomeSource; customerId: string; orderNumber: number } | null> {
  const { data: o } = await supabase.from("orders").select("id, order_number, customer_id, vat_rate").eq("id", id).maybeSingle();
  if (!o) return null;
  const order = o as { id: string; order_number: number; customer_id: string; vat_rate: number };
  const [{ data: items }, charges] = await Promise.all([
    supabase.from("order_items_view").select("*").eq("order_id", id),
    loadCharges(supabase, id),
  ]);
  const lines: CrmDeliveryLine[] = ((items ?? []) as OrderItemViewRow[])
    .filter((it) => it.status !== "cancelled")
    .map((it) => ({
      stone_name: it.stone_name,
      length_m: Number(it.length_m),
      width_m: Number(it.width_m),
      height_m: Number(it.height_m),
      quantity: Number(it.quantity),
      volume_m3: Number(it.volume_m3),
      price_per_m3: Number(it.price_per_m3),
      line_subtotal: Number(it.line_subtotal),
      inventory_pricing_unit: it.inventory_pricing_unit ?? "m3",
    }));
  const { rows } = buildIncomeRowsForDelivery(lines, charges, Number(order.vat_rate));
  return {
    customerId: order.customer_id,
    orderNumber: order.order_number,
    src: { kind: "order", id, label: `הזמנה #${order.order_number}`, rows: rows.map(toRowModel) },
  };
}

async function quoteSource(
  supabase: Supabase,
  id: string
): Promise<{ src: IncomeSource; customerId: string; quoteNumber: number; validUntil: string | null } | null> {
  const { data: q } = await supabase
    .from("quotes")
    .select("id, quote_number, customer_id, vat_rate, valid_until")
    .eq("id", id)
    .maybeSingle();
  if (!q) return null;
  const quote = q as { id: string; quote_number: number; customer_id: string; vat_rate: number; valid_until: string | null };
  const { data: items } = await supabase.from("quote_items_view").select("*").eq("quote_id", id);
  const lines: CrmDeliveryLine[] = ((items ?? []) as QuoteItemViewRow[]).map((it) => ({
    stone_name: it.stone_name,
    length_m: Number(it.length_m),
    width_m: Number(it.width_m),
    height_m: Number(it.height_m),
    quantity: Number(it.quantity),
    volume_m3: Number(it.volume_m3),
    price_per_m3: Number(it.price_per_m3 ?? 0),
    line_subtotal: Number(it.line_subtotal),
    inventory_pricing_unit: it.pricing_unit === "m2" ? "m2" : "m3",
  }));
  const { rows } = buildIncomeRowsForDelivery(lines, [], Number(quote.vat_rate));
  return {
    customerId: quote.customer_id,
    quoteNumber: quote.quote_number,
    validUntil: quote.valid_until,
    src: { kind: "quote", id, label: `הצעת מחיר #${quote.quote_number}`, rows: rows.map(toRowModel) },
  };
}

/** מסמכי Morning בארכיון שמתאימים לקישור (לפי typicalLinks של הסוג) */
async function suggestLinks(
  supabase: Supabase,
  type: GiDocType,
  filter: { deliveryIds?: string[]; orderId?: string | null }
): Promise<LinkedPick[]> {
  const targets = GI_DOC_TYPE_DEFS[type].typicalLinks.map((l) => l.to);
  if (!targets.length) return [];
  const rows: DocumentViewRow[] = [];
  if (filter.deliveryIds?.length) {
    const { data } = await supabase.from("documents_view").select("*").in("delivery_id", filter.deliveryIds).neq("status", "rejected");
    rows.push(...((data ?? []) as DocumentViewRow[]));
  }
  if (filter.orderId) {
    const { data } = await supabase.from("documents_view").select("*").eq("order_id", filter.orderId).neq("status", "rejected");
    rows.push(...((data ?? []) as DocumentViewRow[]));
  }
  const seen = new Set<string>();
  const out: LinkedPick[] = [];
  for (const r of rows) {
    if (!r.green_invoice_id || /^(pending|cancelling):/.test(r.green_invoice_id)) continue;
    if (!r.green_invoice_type || !targets.includes(r.green_invoice_type as GiDocType)) continue;
    if ((r.notes ?? "").startsWith("בוטלה")) continue;
    if (seen.has(r.green_invoice_id)) continue;
    seen.add(r.green_invoice_id);
    out.push({
      greenInvoiceId: r.green_invoice_id,
      label: docLabel(r),
      type: r.green_invoice_type,
      localDocumentId: r.id,
      url: r.green_invoice_url,
    });
  }
  return out;
}

async function linkFromMorningId(supabase: Supabase, greenId: string): Promise<LinkedPick | null> {
  const { data } = await supabase.from("documents_view").select("*").eq("green_invoice_id", greenId).limit(1);
  const r = ((data ?? []) as DocumentViewRow[])[0];
  if (r) {
    return { greenInvoiceId: greenId, label: docLabel(r), type: r.green_invoice_type, localDocumentId: r.id, url: r.green_invoice_url };
  }
  if (!isGreenInvoiceConfigured()) return { greenInvoiceId: greenId, label: `מסמך Morning ${greenId.slice(0, 8)}`, type: null, localDocumentId: null, url: null };
  try {
    const d = await getDocument(greenId);
    const type = Number(d.type);
    return {
      greenInvoiceId: greenId,
      label: `${giDocTypeName(type)} ${d.number ?? ""}`.trim(),
      type: Number.isFinite(type) ? type : null,
      localDocumentId: null,
      url: d.url?.he || d.url?.origin || null,
    };
  } catch {
    return { greenInvoiceId: greenId, label: `מסמך Morning ${greenId.slice(0, 8)}`, type: null, localDocumentId: null, url: null };
  }
}

/**
 * ממלא את הטופס מפרמטרי הכתובת:
 * ?type=&customer=&supplier=&delivery=&order=&quote=&payment=&link=<מזהה מסמך Morning>
 */
export async function buildPrefill(
  supabase: Supabase,
  sp: Record<string, string | string[] | undefined>,
  parties: { customers: PartyOption[]; suppliers: PartyOption[] }
): Promise<MorningFormPrefill> {
  const first = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const today = israelToday();
  const deliveryId = asUuid(sp.delivery);
  const orderIdParam = asUuid(sp.order);
  const quoteId = asUuid(sp.quote);
  const paymentId = asUuid(sp.payment);
  let customerId = asUuid(sp.customer);
  const supplierId = asUuid(sp.supplier);
  const linkParam = first("link").trim();

  const typeParam = Number(first("type"));
  let type: GiDocType = isGiDocType(typeParam)
    ? typeParam
    : supplierId && !customerId
      ? 500
      : paymentId
        ? 400
        : quoteId && !deliveryId && !orderIdParam
          ? 10
          : 305;

  const sourceLabels: string[] = [];
  const incomeSources: IncomeSource[] = [];
  let orderId = orderIdParam;
  let dueDate = "";
  const notes: string[] = [];

  const [del, ord, quo] = await Promise.all([
    deliveryId ? deliverySource(supabase, deliveryId) : null,
    orderIdParam ? orderSource(supabase, orderIdParam) : null,
    quoteId ? quoteSource(supabase, quoteId) : null,
  ]);
  if (del) {
    incomeSources.push(del.src);
    customerId ??= del.delivery.customer_id;
    orderId ??= del.delivery.order_id;
    if (del.delivery.payment_due_date && del.delivery.payment_due_date >= today) dueDate = del.delivery.payment_due_date;
    notes.push(`תעודת משלוח ${del.delivery.delivery_number}`);
  }
  if (ord) {
    incomeSources.push(ord.src);
    customerId ??= ord.customerId;
    notes.push(`הזמנה ${ord.orderNumber}`);
  }
  if (quo) {
    incomeSources.push(quo.src);
    customerId ??= quo.customerId;
    if (quo.validUntil && quo.validUntil >= today) dueDate ||= quo.validUntil;
    notes.push(`הצעת מחיר ${quo.quoteNumber}`);
  }

  let payment: PaymentRow | null = null;
  let paymentDeliveryIds: string[] = [];
  if (paymentId) {
    const { data } = await supabase.from("payments").select("*").eq("id", paymentId).maybeSingle();
    payment = (data as PaymentRow | null) ?? null;
    if (payment) {
      customerId ??= payment.customer_id;
      sourceLabels.push(`תשלום #${payment.payment_number}`);
      notes.push(`תשלום ${payment.payment_number}`);
      const { data: allocs } = await supabase.from("payment_allocations").select("delivery_id").eq("payment_id", paymentId);
      paymentDeliveryIds = ((allocs ?? []) as { delivery_id: string }[]).map((a) => a.delivery_id);
    }
  }

  if (GI_DOC_TYPE_DEFS[type].counterparty === "supplier" && !supplierId) type = 305;
  const def = GI_DOC_TYPE_DEFS[type];
  const model = emptyDocumentModel(type, today);
  if (def.fields.dueDate !== "forbidden") model.dueDate = dueDate;

  // לקוח / ספק
  const party =
    def.counterparty === "supplier"
      ? parties.suppliers.find((s) => s.id === supplierId)
      : parties.customers.find((c) => c.id === customerId);
  if (party) {
    model.client = {
      id: null,
      name: party.name,
      taxId: party.tax_id ?? "",
      emails: cleanEmails([party.email]),
      address: party.address ?? "",
      phone: party.phone ?? "",
      country: "IL",
      add: false,
      self: false,
    };
  }

  // שורות הכנסה: הראשון מבין משלוח / הזמנה / הצעה
  if (def.income !== "forbidden" && incomeSources.length) {
    model.income = incomeSources[0].rows.map((r) => ({ ...r }));
    sourceLabels.unshift(incomeSources[0].label);
  }

  // תקבולים מתשלום
  if (payment && def.payment !== "forbidden") {
    const t = METHOD_TO_GI[payment.method] ?? 11;
    const row: DocPaymentRowModel = {
      type: t,
      date: payment.paid_at > today ? today : payment.paid_at,
      price: Number(payment.amount),
    };
    if (t === 2) {
      row.chequeNum = payment.reference ?? "";
      row.bankName = payment.bank_name ?? "";
    } else if (t === 4) {
      row.bankName = payment.bank_name ?? "";
    } else if (t === 3) {
      row.cardType = 0;
      row.dealType = 1;
      row.numPayments = 1;
    }
    model.payment = [row];
  }

  // קישורים
  const linked: LinkedPick[] = [];
  if (linkParam && /^[\w-]{6,80}$/.test(linkParam)) {
    const l = await linkFromMorningId(supabase, linkParam);
    if (l) linked.push(l);
  }
  for (const l of await suggestLinks(supabase, type, {
    deliveryIds: [...(deliveryId ? [deliveryId] : []), ...paymentDeliveryIds],
    orderId,
  })) {
    if (!linked.some((x) => x.greenInvoiceId === l.greenInvoiceId)) linked.push(l);
  }
  model.linkedDocumentIds = linked.map((l) => l.greenInvoiceId);
  model.linkType = linked.length ? suggestedLinkType(type, linked[0].type) : "";
  if (model.linkType && !def.linkTypes.includes(model.linkType)) model.linkType = def.defaultLinkType;

  return {
    model,
    context: {
      customerId: def.counterparty === "customer" ? (party?.id ?? null) : null,
      supplierId: def.counterparty === "supplier" ? (party?.id ?? null) : null,
      orderId,
      deliveryId,
      paymentId: payment?.id ?? null,
      quoteId,
      note: notes.length ? notes.join(" · ") : null,
    },
    linked,
    incomeSources,
    sourceLabels,
  };
}
