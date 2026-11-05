import { createClient } from "@/lib/supabase/server";
import type { PaymentMethodDb } from "@/lib/db/types";

import {
  PaymentsPanelView,
  type PaymentsPanelData,
  type PaymentsPanelItem,
} from "./payments-panel-view";

export { PaymentsPanelView };
export type { PaymentsPanelData, PaymentsPanelItem };

type PanelTarget = { customerId: string } | { deliveryId: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * טעינת הנתונים לפאנל (לשימוש ישיר מ-Server Component, או כדי להעביר
 * `data` ל-PaymentsPanelView מתוך Client Component).
 */
export async function loadPaymentsPanelData(
  target: PanelTarget
): Promise<PaymentsPanelData> {
  const supabase = await createClient();

  if ("deliveryId" in target) {
    const [{ data: dRows, error: dErr }, { data: allocs, error: aErr }] =
      await Promise.all([
        supabase
          .from("deliveries_view")
          .select("id, customer_id, total, amount_paid, paid_outside_payments, balance")
          .eq("id", target.deliveryId)
          .limit(1),
        supabase
          .from("payment_allocations_view")
          .select("payment_id, payment_number, paid_at, method, reference, amount")
          .eq("delivery_id", target.deliveryId)
          .order("paid_at", { ascending: false }),
      ]);
    const d = dRows?.[0];
    return {
      mode: "delivery",
      customerId: (d?.customer_id as string) ?? "",
      deliveryId: target.deliveryId,
      items: (allocs ?? []).map((a) => ({
        payment_id: a.payment_id as string,
        payment_number: a.payment_number as number,
        paid_at: a.paid_at as string,
        method: a.method as PaymentMethodDb,
        reference: (a.reference as string | null) ?? null,
        amount: Number(a.amount),
      })),
      balance: Number(d?.balance ?? 0),
      credit: 0,
      total: Number(d?.total ?? 0),
      amountPaid: Number(d?.amount_paid ?? 0),
      paidOutsidePayments: Number(d?.paid_outside_payments ?? 0),
      error: dErr || aErr || !d ? "טעינת התשלומים נכשלה" : undefined,
    };
  }

  const [{ data: pays, error: pErr }, { data: open, error: oErr }] =
    await Promise.all([
      supabase
        .from("payments_view")
        .select(
          "id, payment_number, paid_at, method, reference, amount, unallocated_amount, delivery_numbers"
        )
        .eq("customer_id", target.customerId)
        .order("paid_at", { ascending: false })
        .limit(50),
      supabase
        .from("debtors_view")
        .select("balance")
        .eq("customer_id", target.customerId),
    ]);

  const items: PaymentsPanelItem[] = (pays ?? []).map((p) => ({
    payment_id: p.id as string,
    payment_number: p.payment_number as number,
    paid_at: p.paid_at as string,
    method: p.method as PaymentMethodDb,
    reference: (p.reference as string | null) ?? null,
    amount: Number(p.amount),
    unallocated: Number(p.unallocated_amount),
    delivery_numbers: (p.delivery_numbers as number[] | null) ?? [],
  }));

  return {
    mode: "customer",
    customerId: target.customerId,
    items,
    balance: round2((open ?? []).reduce((s, r) => s + Number(r.balance), 0)),
    credit: round2(items.reduce((s, i) => s + Math.max(0, i.unallocated ?? 0), 0)),
    error: pErr || oErr ? "טעינת התשלומים נכשלה" : undefined,
  };
}

/**
 * פאנל תשלומים לשילוב בדפי לקוח / תעודת משלוח (Server Component).
 *   <PaymentsPanel customerId={id} />
 *   <PaymentsPanel deliveryId={id} />
 */
export async function PaymentsPanel(
  props: { customerId: string; deliveryId?: never } | { deliveryId: string; customerId?: never }
) {
  const data = await loadPaymentsPanelData(
    props.deliveryId ? { deliveryId: props.deliveryId } : { customerId: props.customerId as string }
  );
  return <PaymentsPanelView data={data} />;
}
