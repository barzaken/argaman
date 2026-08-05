"use server";

import { z } from "zod";

import { requireAuth } from "@/lib/supabase/auth-helpers";

export type DebtorPrintDelivery = {
  delivery_id: string;
  delivery_number: number;
  order_number: number;
  subtotal: number;
  vat_amount: number;
  total: number;
};

export type DebtorPrintData = {
  customer_name: string;
  customer_tax_id: string;
  customer_phone: string | null;
  customer_email: string | null;
  deliveries: DebtorPrintDelivery[];
};

export type DebtorPrintResult =
  | { ok: true; data: DebtorPrintData }
  | { ok: false; message: string };

export async function getDebtorPrintData(
  deliveryIds: string[]
): Promise<DebtorPrintResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = z.array(z.string().uuid()).min(1).safeParse(deliveryIds);
  if (!parsed.success) {
    return { ok: false, message: "יש לבחור לפחות תעודה אחת" };
  }

  const ids = parsed.data;

  const { data: deliveries, error: deliveriesError } = await auth.supabase
    .from("deliveries_view")
    .select(
      "id, delivery_number, order_number, payment_status, subtotal, vat_amount, total, customer_id, customer_name, customer_tax_id, customer_phone, customer_email"
    )
    .in("id", ids);

  if (deliveriesError) {
    return { ok: false, message: deliveriesError.message };
  }

  if (!deliveries || deliveries.length === 0) {
    return { ok: false, message: "לא נמצאו תעודות משלוח" };
  }

  if (deliveries.length !== ids.length) {
    return { ok: false, message: "חלק מהתעודות לא נמצאו" };
  }

  const customerIds = new Set(deliveries.map((d) => d.customer_id));
  if (customerIds.size !== 1) {
    return { ok: false, message: "כל התעודות חייבות להיות של אותו לקוח" };
  }

  const unpaid = deliveries.filter((d) => d.payment_status !== "unpaid");
  if (unpaid.length > 0) {
    return { ok: false, message: "ניתן להדפיס רק תעודות שלא שולמו" };
  }

  const first = deliveries[0];

  return {
    ok: true,
    data: {
      customer_name: first.customer_name as string,
      customer_tax_id: first.customer_tax_id as string,
      customer_phone: (first.customer_phone as string | null) ?? null,
      customer_email: (first.customer_email as string | null) ?? null,
      deliveries: [...deliveries]
        .sort(
          (a, b) =>
            (a.delivery_number as number) - (b.delivery_number as number)
        )
        .map((d) => ({
          delivery_id: d.id as string,
          delivery_number: d.delivery_number as number,
          order_number: d.order_number as number,
          subtotal: Number(d.subtotal),
          vat_amount: Number(d.vat_amount),
          total: Number(d.total),
        })),
    },
  };
}
