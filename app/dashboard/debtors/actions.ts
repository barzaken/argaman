"use server";

import { z } from "zod";

import type {
  DeliveryItemRow,
  DeliveryViewRow,
  InventoryPricingUnitDb,
} from "@/lib/db/types";
import { requireAuth } from "@/lib/supabase/auth-helpers";

export type DebtorPrintDeliveryDoc = {
  delivery: DeliveryViewRow;
  lines: DeliveryItemRow[];
};

export type DebtorPrintData = {
  customer_name: string;
  customer_tax_id: string;
  customer_phone: string | null;
  customer_email: string | null;
  deliveryDocs: DebtorPrintDeliveryDoc[];
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
    .select("*")
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

  const { data: items, error: itemsError } = await auth.supabase
    .from("delivery_items")
    .select("*, inventory_items(pricing_unit)")
    .in("delivery_id", ids);

  if (itemsError) {
    return { ok: false, message: itemsError.message };
  }

  const linesByDelivery = new Map<string, DeliveryItemRow[]>();
  for (const row of items ?? []) {
    const inv = row.inventory_items as {
      pricing_unit: InventoryPricingUnitDb;
    } | null;
    const { inventory_items: _inv, ...rest } = row;
    const line = {
      ...rest,
      inventory_pricing_unit: inv?.pricing_unit ?? "m3",
    } as DeliveryItemRow;

    const list = linesByDelivery.get(line.delivery_id) ?? [];
    list.push(line);
    linesByDelivery.set(line.delivery_id, list);
  }

  const sorted = [...(deliveries as DeliveryViewRow[])].sort(
    (a, b) => a.delivery_number - b.delivery_number
  );

  const first = sorted[0];

  return {
    ok: true,
    data: {
      customer_name: first.customer_name,
      customer_tax_id: first.customer_tax_id,
      customer_phone: first.customer_phone,
      customer_email: first.customer_email,
      deliveryDocs: sorted.map((delivery) => ({
        delivery,
        lines: linesByDelivery.get(delivery.id) ?? [],
      })),
    },
  };
}
