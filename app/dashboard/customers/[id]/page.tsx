import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerPriceOverrides } from "./customer-price-overrides";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/server";
import type { CustomerInventoryPriceRow } from "@/lib/db/types";
import type { CustomerRow } from "@/lib/db/types";
import type { InventoryItemViewRow } from "@/lib/db/types";
import { formatIls } from "@/lib/db/format";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !customer) notFound();

  const c = customer as CustomerRow;

  const { data: prices } = await supabase
    .from("customer_inventory_prices")
    .select("*")
    .eq("customer_id", id);

  const invIds = (prices ?? []).map(
    (p) => p.inventory_item_id as string
  );

  const invMap = new Map<string, InventoryItemViewRow>();
  if (invIds.length > 0) {
    const { data: invRows } = await supabase
      .from("inventory_items_view")
      .select("id, stone_name, polish_type")
      .in("id", invIds);
    for (const row of invRows ?? []) {
      invMap.set(row.id as string, row as InventoryItemViewRow);
    }
  }

  const overrides = (prices ?? []).map((p) => {
    const pr = p as CustomerInventoryPriceRow;
    const inv = invMap.get(pr.inventory_item_id);
    const label = inv
      ? `${inv.stone_name} · ${inv.polish_type}`
      : pr.inventory_item_id;
    return { ...pr, label };
  });

  const { data: inventoryOptions } = await supabase
    .from("inventory_items_view")
    .select("id, stone_name, polish_type")
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: orders } = await supabase
    .from("orders_view")
    .select("*")
    .eq("customer_id", id)
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: deliveries } = await supabase
    .from("deliveries_view")
    .select("*")
    .eq("customer_id", id)
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-auto p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[min(100%,80rem)] flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{c.name}</h2>
            <p className="text-muted-foreground text-sm tabular-nums">
              ח.פ / ת״ז: {c.tax_id}
            </p>
            {c.email ? (
              <p className="text-muted-foreground text-sm">{c.email}</p>
            ) : null}
            {c.phone ? (
              <p className="text-muted-foreground text-sm tabular-nums">
                {c.phone}
              </p>
            ) : null}
            {c.address ? (
              <p className="mt-2 text-foreground text-sm">{c.address}</p>
            ) : null}
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/customers/${id}/edit`}>עריכה</Link>
          </Button>
        </div>

        <CustomerPriceOverrides
          customerId={id}
          overrides={overrides}
          inventoryOptions={
            (inventoryOptions ?? []) as Pick<
              InventoryItemViewRow,
              "id" | "stone_name" | "polish_type"
            >[]
          }
        />

        <section className="flex flex-col gap-2">
          <h3 className="font-semibold text-foreground">הזמנות אחרונות</h3>
          <ul className="flex flex-col gap-1">
            {(orders ?? []).map((o) => (
              <li key={o.id as string}>
                <Link
                  className="text-primary text-sm underline-offset-4 hover:underline"
                  href={`/dashboard/orders/${o.id}`}
                >
                  הזמנה #{o.order_number as number} ·{" "}
                  {formatIls(Number(o.total))}
                </Link>
              </li>
            ))}
            {(orders ?? []).length === 0 ? (
              <li className="text-muted-foreground text-sm">אין הזמנות</li>
            ) : null}
          </ul>
        </section>

        <Separator />

        <section className="flex flex-col gap-2">
          <h3 className="font-semibold text-foreground">תעודות משלוח</h3>
          <ul className="flex flex-col gap-1">
            {(deliveries ?? []).map((d) => (
              <li key={d.id as string}>
                <Link
                  className="text-primary text-sm underline-offset-4 hover:underline"
                  href={`/dashboard/deliveries/${d.id}`}
                >
                  משלוח #{d.delivery_number as number} ·{" "}
                  {d.payment_status === "paid" ? "שולם" : "לא שולם"}
                </Link>
              </li>
            ))}
            {(deliveries ?? []).length === 0 ? (
              <li className="text-muted-foreground text-sm">אין משלוחים</li>
            ) : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
