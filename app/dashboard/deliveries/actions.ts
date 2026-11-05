"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/zod-he";

import { toHebrewError } from "@/lib/db/errors";
import { optionalDateSchema } from "@/lib/db/validation";

import type {
  DeliveryStatusDb,
  FulfillmentMethodDb,
  OrderStatusDb,
  PaymentMethodDb,
} from "@/lib/db/types";
import { requireAuth } from "@/lib/supabase/auth-helpers";

/** YYYY-MM-DD לפי שעון ישראל */
function todayInIsrael(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
  }).format(new Date());
}

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; message: string };

export async function createDeliveryFromOrder(
  orderId: string
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = z.string().uuid().safeParse(orderId);
  if (!parsed.success) return { ok: false, message: "מזהה לא תקין" };

  const { data, error } = await auth.supabase.rpc(
    "crm_create_delivery_from_order",
    { p_order_id: parsed.data }
  );

  if (error) return { ok: false, message: toHebrewError(error) };

  const deliveryId = data as string;

  revalidatePath("/dashboard/deliveries");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/order-items");
  revalidatePath("/dashboard/debtors");
  revalidatePath("/dashboard");
  return { ok: true, id: deliveryId };
}

const updateDeliverySchema = z.object({
  id: z.string().uuid(),
  payment_method: z
    .enum(["cash", "bank_transfer", "check", "credit_card", "other"])
    .optional()
    .nullable(),
  payment_due_date: optionalDateSchema,
  fulfillment_method: z.enum(["pickup", "shipping"]),
  shipping_address: z.string().optional().nullable(),
  delivered_at: optionalDateSchema,
  green_invoice_id: z.string().optional().nullable(),
  // payment_status לא נערך כאן: הוא נגזר בטריגר מהתשלומים (רישום תשלום / markDeliveryPaid)
  status: z.enum(["waiting_for_pickup", "in_transit", "delivered", "cancelled"]),
});

export async function updateDelivery(
  raw: z.infer<typeof updateDeliverySchema>
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = updateDeliverySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  if (
    parsed.data.fulfillment_method === "shipping" &&
    (!parsed.data.shipping_address ||
      parsed.data.shipping_address.trim().length === 0)
  ) {
    return { ok: false, message: "כתובת חובה בשילוח" };
  }

  const { data: deliveryRow, error: fetchErr } = await auth.supabase
    .from("deliveries")
    .select("order_id")
    .eq("id", parsed.data.id)
    .single();

  if (fetchErr || !deliveryRow) {
    return { ok: false, message: toHebrewError(fetchErr, "לא נמצא משלוח") };
  }

  const patch = {
    payment_method: parsed.data.payment_method as PaymentMethodDb | null,
    payment_due_date: parsed.data.payment_due_date || null,
    fulfillment_method: parsed.data.fulfillment_method as FulfillmentMethodDb,
    shipping_address:
      parsed.data.fulfillment_method === "shipping"
        ? parsed.data.shipping_address?.trim() ?? null
        : null,
    delivered_at:
      parsed.data.delivered_at ||
      (parsed.data.status === "delivered" ? todayInIsrael() : null),
    green_invoice_id: parsed.data.green_invoice_id?.trim() || null,
    status: parsed.data.status as DeliveryStatusDb,
  };

  const { error } = await auth.supabase
    .from("deliveries")
    .update(patch)
    .eq("id", parsed.data.id);

  if (error) return { ok: false, message: toHebrewError(error) };

  if (parsed.data.status === "delivered") {
    const { error: orderErr } = await auth.supabase
      .from("orders")
      .update({ status: "completed" as OrderStatusDb })
      .eq("id", deliveryRow.order_id as string);
    if (orderErr) {
      return {
        ok: false,
        message: `התעודה נשמרה, אך עדכון סטטוס ההזמנה נכשל: ${toHebrewError(orderErr)}`,
      };
    }
  }

  revalidatePath("/dashboard/deliveries");
  revalidatePath(`/dashboard/deliveries/${parsed.data.id}`);
  revalidatePath("/dashboard/debtors");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard");
  return { ok: true };
}

const markPaidSchema = z.object({
  id: z.string().uuid(),
  method: z
    .enum(["cash", "bank_transfer", "check", "credit_card", "other"])
    .optional()
    .nullable(),
  paid_at: optionalDateSchema,
  reference: z.string().max(200).optional().nullable(),
});

/**
 * "סמן כשולם": יוצר תשלום (payments) על יתרת התעודה ומקצה אותו אליה
 * (rpc crm_mark_delivery_paid). אמצעי התשלום ברירת מחדל: זה שעל התעודה, או "אחר".
 */
export async function markDeliveryPaid(
  id: string,
  opts?: {
    method?: PaymentMethodDb | null;
    paid_at?: string | null;
    reference?: string | null;
  }
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = markPaidSchema.safeParse({ id, ...opts });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "מזהה לא תקין" };
  }

  const { data, error } = await auth.supabase.rpc("crm_mark_delivery_paid", {
    p_delivery_id: parsed.data.id,
    p_method: parsed.data.method ?? null,
    p_paid_at: parsed.data.paid_at || null,
    p_reference: parsed.data.reference?.trim() || null,
  });

  if (error) return { ok: false, message: toHebrewError(error) };

  revalidatePath("/dashboard/deliveries");
  revalidatePath(`/dashboard/deliveries/${parsed.data.id}`);
  revalidatePath("/dashboard/debtors");
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/payments");
  revalidatePath("/dashboard");
  return { ok: true, id: (data as string | null) ?? undefined };
}
