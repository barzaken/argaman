"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type {
  DeliveryStatusDb,
  FulfillmentMethodDb,
  OrderStatusDb,
  PaymentMethodDb,
  PaymentStatusDb,
} from "@/lib/db/types";
import { requireAuth } from "@/lib/supabase/auth-helpers";

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

  if (error) return { ok: false, message: error.message };

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
  payment_due_date: z.string().optional().nullable(),
  fulfillment_method: z.enum(["pickup", "shipping"]),
  shipping_address: z.string().optional().nullable(),
  delivered_at: z.string().optional().nullable(),
  green_invoice_id: z.string().optional().nullable(),
  payment_status: z.enum(["unpaid", "paid"]),
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
    return { ok: false, message: fetchErr?.message ?? "לא נמצא משלוח" };
  }

  const patch = {
    payment_method: parsed.data.payment_method as PaymentMethodDb | null,
    payment_due_date: parsed.data.payment_due_date || null,
    fulfillment_method: parsed.data.fulfillment_method as FulfillmentMethodDb,
    shipping_address:
      parsed.data.fulfillment_method === "shipping"
        ? parsed.data.shipping_address?.trim() ?? null
        : null,
    delivered_at: parsed.data.delivered_at || null,
    green_invoice_id: parsed.data.green_invoice_id?.trim() || null,
    payment_status: parsed.data.payment_status as PaymentStatusDb,
    status: parsed.data.status as DeliveryStatusDb,
  };

  const { error } = await auth.supabase
    .from("deliveries")
    .update(patch)
    .eq("id", parsed.data.id);

  if (error) return { ok: false, message: error.message };

  if (parsed.data.status === "delivered") {
    await auth.supabase
      .from("orders")
      .update({ status: "completed" as OrderStatusDb })
      .eq("id", deliveryRow.order_id as string);
  }

  revalidatePath("/dashboard/deliveries");
  revalidatePath(`/dashboard/deliveries/${parsed.data.id}`);
  revalidatePath("/dashboard/debtors");
  revalidatePath("/dashboard/orders");
  return { ok: true };
}

export async function markDeliveryPaid(id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "מזהה לא תקין" };

  const { error } = await auth.supabase
    .from("deliveries")
    .update({ payment_status: "paid" as PaymentStatusDb })
    .eq("id", parsed.data);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/deliveries");
  revalidatePath(`/dashboard/deliveries/${parsed.data}`);
  revalidatePath("/dashboard/debtors");
  revalidatePath("/dashboard");
  return { ok: true };
}
