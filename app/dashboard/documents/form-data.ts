import type { EntityOption } from "@/components/documents/entity-picker";
import type { LinkedRef } from "@/components/documents/document-form";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function asUuid(v: string | string[] | undefined | null): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && UUID_RE.test(s) ? s : null;
}

/** לקוחות וספקים פעילים לבחירה בטופס */
export async function loadEntityOptions(
  supabase: Supabase,
  keepIds: { customerId?: string | null; supplierId?: string | null } = {}
): Promise<{ customers: EntityOption[]; suppliers: EntityOption[] }> {
  const [{ data: customers }, { data: suppliers }] = await Promise.all([
    supabase.from("customers").select("id, name, tax_id, is_active").order("name"),
    supabase.from("suppliers").select("id, name, tax_id, is_active").order("name"),
  ]);
  const pick = (rows: { id: string; name: string; tax_id: string | null; is_active: boolean }[], keep?: string | null) =>
    rows
      .filter((r) => r.is_active || r.id === keep)
      .map((r) => ({ id: r.id, name: r.name, tax_id: r.tax_id }));
  return {
    customers: pick((customers ?? []) as never[], keepIds.customerId),
    suppliers: pick((suppliers ?? []) as never[], keepIds.supplierId),
  };
}

/** תוויות לקישורים להזמנה / משלוח / תשלום / הוצאה */
export async function loadLinkedRefs(
  supabase: Supabase,
  ids: { orderId?: string | null; deliveryId?: string | null; paymentId?: string | null; expenseId?: string | null }
): Promise<Partial<Record<"order" | "delivery" | "payment" | "expense", LinkedRef>>> {
  const [order, delivery, payment, expense] = await Promise.all([
    ids.orderId
      ? supabase.from("orders").select("id, order_number, customer_id").eq("id", ids.orderId).maybeSingle()
      : null,
    ids.deliveryId
      ? supabase
          .from("deliveries")
          .select("id, delivery_number, customer_id")
          .eq("id", ids.deliveryId)
          .maybeSingle()
      : null,
    ids.paymentId
      ? supabase.from("payments").select("id, payment_number").eq("id", ids.paymentId).maybeSingle()
      : null,
    ids.expenseId
      ? supabase.from("expenses").select("id, document_number, description").eq("id", ids.expenseId).maybeSingle()
      : null,
  ]);
  const out: Partial<Record<"order" | "delivery" | "payment" | "expense", LinkedRef>> = {};
  if (order?.data) {
    out.order = {
      id: order.data.id as string,
      label: `הזמנה #${order.data.order_number}`,
      href: `/dashboard/orders/${order.data.id}`,
    };
  }
  if (delivery?.data) {
    out.delivery = {
      id: delivery.data.id as string,
      label: `תעודת משלוח #${delivery.data.delivery_number}`,
      href: `/dashboard/deliveries/${delivery.data.id}`,
    };
  }
  if (payment?.data) {
    out.payment = {
      id: payment.data.id as string,
      label: `תשלום #${payment.data.payment_number}`,
      href: `/dashboard/payments/${payment.data.id}`,
    };
  }
  if (expense?.data) {
    const e = expense.data as { id: string; document_number: string | null; description: string | null };
    out.expense = {
      id: e.id,
      label: `הוצאה${e.document_number ? ` #${e.document_number}` : e.description ? ` · ${e.description}` : ""}`,
      href: `/dashboard/expenses/${e.id}`,
    };
  }
  return out;
}
