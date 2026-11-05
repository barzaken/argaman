"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/zod-he";

import { toHebrewError } from "@/lib/db/errors";
import { optionalDateSchema } from "@/lib/db/validation";
import type { PaymentAllocationInput } from "@/lib/db/types";
import { requireAdmin, requireAuth } from "@/lib/supabase/auth-helpers";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; message: string };

const methodSchema = z.enum(
  ["cash", "bank_transfer", "check", "credit_card", "other"],
  { message: "יש לבחור אמצעי תשלום" }
);

const moneySchema = z
  .number({ message: "סכום לא תקין" })
  .finite("סכום לא תקין")
  .positive("הסכום חייב להיות גדול מאפס");

const allocationsSchema = z
  .array(
    z.object({
      delivery_id: z.string().uuid("תעודת משלוח לא תקינה"),
      amount: moneySchema,
    })
  )
  .max(200);

const optionalText = (max: number) =>
  z.string().max(max, `עד ${max} תווים`).optional().nullable();

const recordPaymentSchema = z.object({
  customer_id: z.string({ message: "יש לבחור לקוח" }).uuid("יש לבחור לקוח"),
  amount: moneySchema,
  paid_at: optionalDateSchema,
  method: methodSchema,
  reference: optionalText(200),
  bank_name: optionalText(200),
  notes: optionalText(2000),
  document_id: z.string().uuid().optional().nullable(),
  allocations: allocationsSchema.default([]),
});

export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;

const round2 = (n: number) => Math.round(n * 100) / 100;

function revalidatePaymentPaths(paymentId?: string) {
  revalidatePath("/dashboard/payments");
  if (paymentId) revalidatePath(`/dashboard/payments/${paymentId}`);
  revalidatePath("/dashboard/debtors");
  revalidatePath("/dashboard/deliveries");
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/documents");
  revalidatePath("/dashboard");
}

/** כפילויות של אותה תעודה מאוחדות לשורה אחת; סכומים מעוגלים לאגורות. */
function mergeAllocations(list: PaymentAllocationInput[]): PaymentAllocationInput[] {
  const map = new Map<string, number>();
  for (const a of list) {
    map.set(a.delivery_id, round2((map.get(a.delivery_id) ?? 0) + a.amount));
  }
  return [...map.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([delivery_id, amount]) => ({ delivery_id, amount }));
}

/**
 * רישום תשלום מלקוח + שיוך (מלא / חלקי) לתעודות משלוח, באופן אטומי
 * (rpc crm_record_payment). מה שלא שויך נשאר כזיכוי ללקוח.
 * document_id: מסמך (צילום צ׳ק / אישור העברה) — מקושר לתשלום ומסומן "טופל".
 */
export async function recordPayment(
  raw: RecordPaymentInput
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = recordPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  const d = parsed.data;
  const amount = round2(d.amount);
  const allocations = mergeAllocations(d.allocations);
  const allocated = round2(allocations.reduce((s, a) => s + a.amount, 0));
  if (allocated > amount + 0.005) {
    return {
      ok: false,
      message: `סכום השיוך לתעודות (${allocated.toFixed(2)} ₪) גדול מסכום התשלום (${amount.toFixed(2)} ₪).`,
    };
  }

  const { data, error } = await auth.supabase.rpc("crm_record_payment", {
    p_customer_id: d.customer_id,
    p_amount: amount,
    p_paid_at: d.paid_at || null,
    p_method: d.method,
    p_reference: d.reference?.trim() || null,
    p_bank_name: d.bank_name?.trim() || null,
    p_notes: d.notes?.trim() || null,
    p_document_id: d.document_id || null,
    p_allocations: allocations,
  });

  if (error) return { ok: false, message: toHebrewError(error) };

  const id = data as string;
  revalidatePaymentPaths(id);
  if (d.document_id) revalidatePath(`/dashboard/documents/${d.document_id}`);
  return { ok: true, id };
}

const allocateSchema = z.object({
  payment_id: z.string().uuid("מזהה תשלום לא תקין"),
  allocations: allocationsSchema.min(1, "יש להזין סכום לשיוך לפחות לתעודה אחת"),
});

/**
 * "שיוך יתרה": מוסיף הקצאות מתשלום קיים (עם זיכוי לא משויך) לתעודות משלוח.
 * הטריגר payment_allocations_check חוסם חריגה מסכום התשלום / מיתרת התעודה /
 * תעודה של לקוח אחר. אם לתעודה כבר יש הקצאה מאותו תשלום — מגדילים אותה.
 */
export async function allocatePayment(raw: {
  payment_id: string;
  allocations: PaymentAllocationInput[];
}): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = allocateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  const paymentId = parsed.data.payment_id;
  const allocations = mergeAllocations(parsed.data.allocations);

  const { data: payRows, error: payErr } = await auth.supabase
    .from("payments_view")
    .select("id, unallocated_amount")
    .eq("id", paymentId)
    .limit(1);
  if (payErr) return { ok: false, message: toHebrewError(payErr) };
  const payment = payRows?.[0] as
    | { id: string; unallocated_amount: number }
    | undefined;
  if (!payment) return { ok: false, message: "התשלום לא נמצא" };

  const total = round2(allocations.reduce((s, a) => s + a.amount, 0));
  const free = round2(Number(payment.unallocated_amount));
  if (total > free + 0.005) {
    return {
      ok: false,
      message: `סכום השיוך (${total.toFixed(2)} ₪) גדול מהזיכוי הלא משויך של התשלום (${free.toFixed(2)} ₪).`,
    };
  }

  const { data: existing, error: exErr } = await auth.supabase
    .from("payment_allocations")
    .select("id, delivery_id, amount")
    .eq("payment_id", paymentId);
  if (exErr) return { ok: false, message: toHebrewError(exErr) };
  const existingByDelivery = new Map(
    (existing ?? []).map((r) => [
      r.delivery_id as string,
      { id: r.id as string, amount: Number(r.amount) },
    ])
  );

  let done = 0;
  for (const a of allocations) {
    const prev = existingByDelivery.get(a.delivery_id);
    const { error } = prev
      ? await auth.supabase
          .from("payment_allocations")
          .update({ amount: round2(prev.amount + a.amount) })
          .eq("id", prev.id)
      : await auth.supabase.from("payment_allocations").insert({
          payment_id: paymentId,
          delivery_id: a.delivery_id,
          amount: a.amount,
        });
    if (error) {
      revalidatePaymentPaths(paymentId);
      const msg = toHebrewError(error);
      return {
        ok: false,
        message:
          done > 0
            ? `${done} שיוכים נשמרו, אך שיוך נוסף נכשל: ${msg}`
            : msg,
      };
    }
    done += 1;
  }

  revalidatePaymentPaths(paymentId);
  return { ok: true, id: paymentId };
}

/**
 * מחיקת תשלום (מנהל בלבד). ההקצאות נמחקות איתו, ותעודות המשלוח חוזרות
 * להיות "לא שולם" / "שולם חלקית" בהתאם.
 */
export async function deletePayment(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "מזהה לא תקין" };

  const { data, error } = await auth.supabase
    .from("payments")
    .delete()
    .eq("id", parsed.data)
    .select("id");

  if (error) return { ok: false, message: toHebrewError(error) };
  if (!data || data.length === 0) {
    return { ok: false, message: "התשלום לא נמחק — ייתכן שכבר נמחק או שאין הרשאה." };
  }

  revalidatePaymentPaths(parsed.data);
  return { ok: true };
}
