import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import type { DeliveryItemRow } from "@/lib/db/types";
import type { DeliveryViewRow } from "@/lib/db/types";
import { formatIls, formatIssueDate, formatVolumeM3 } from "@/lib/db/format";

export default async function DeliveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: delivery, error } = await supabase
    .from("deliveries_view")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !delivery) notFound();

  const d = delivery as DeliveryViewRow;

  const { data: items } = await supabase
    .from("delivery_items")
    .select("*")
    .eq("delivery_id", id);

  const lines = (items ?? []) as DeliveryItemRow[];

  const shippingAddressDisplay =
    d.fulfillment_method === "shipping"
      ? (d.shipping_address ?? "—")
      : "איסוף עצמי (ללא כתובת משלוח)";

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-auto p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[min(100%,80rem)] flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              תעודת משלוח #{d.delivery_number}
            </h2>
            <p className="text-muted-foreground text-sm">
              הזמנה #{d.order_number}
            </p>
            <p className="text-sm tabular-nums">
              סכום כולל מע״מ:{" "}
              <span className="font-semibold">{formatIls(Number(d.total))}</span>
            </p>
            <p className="text-sm">
              תשלום: {d.payment_status === "paid" ? "שולם" : "לא שולם"}
              {d.payment_method ? ` · ${d.payment_method}` : ""}
            </p>
            {d.green_invoice_id ? (
              <p className="text-sm tabular-nums">
                Green Invoice: {d.green_invoice_id}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/deliveries/${id}/edit`}>עריכה</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/deliveries">חזרה</Link>
            </Button>
          </div>
        </div>

        <section
          className="rounded-md border bg-card p-4"
          aria-label="פרטי תעודת ההזמנה"
        >
          <h3 className="text-base font-semibold text-foreground">
            תעודת הזמנה
          </h3>
          <p className="text-muted-foreground text-sm">
            הזמנה מס׳ {d.order_number}
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">
                לקוח (שם העסק.לקוח)
              </dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {d.customer_name}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ח.פ / ת.ז</dt>
              <dd className="mt-0.5 font-medium text-foreground tabular-nums">
                {d.customer_tax_id ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">כתובת משלוח</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {shippingAddressDisplay}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">מספר טלפון</dt>
              <dd className="mt-0.5 font-medium text-foreground tabular-nums">
                {d.customer_phone ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">תאריך הנפקה</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {formatIssueDate(d.created_at)}
              </dd>
            </div>
          </dl>
        </section>

        <div className="overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>אבן</TableHead>
                <TableHead>מידות</TableHead>
                <TableHead className="text-end">כמות</TableHead>
                <TableHead className="text-end">נפח</TableHead>
                <TableHead className="text-end">מחיר קו״ב</TableHead>
                <TableHead className="text-end">סכום</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((ln) => (
                <TableRow key={ln.id}>
                  <TableCell>{ln.stone_name}</TableCell>
                  <TableCell className="tabular-nums">
                    {ln.length_m}×{ln.width_m}×{ln.height_m}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {ln.quantity}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {formatVolumeM3(Number(ln.volume_m3))}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {formatIls(Number(ln.price_per_m3))}
                  </TableCell>
                  <TableCell className="text-end tabular-nums font-medium">
                    {formatIls(Number(ln.line_subtotal))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
