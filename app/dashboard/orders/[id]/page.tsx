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
import type { OrderItemViewRow, OrderViewRow, PriorityDb } from "@/lib/db/types";
import { formatIls, formatVolumeM3 } from "@/lib/db/format";

const orderStatusLabels: Record<OrderViewRow["status"], string> = {
  open: "פתוחה",
  in_production: "בייצור",
  ready_for_delivery: "מוכנה למשלוח",
  completed: "הושלמה",
  cancelled: "בוטלה",
};

const priorityLabels: Record<PriorityDb, string> = {
  low: "נמוך",
  medium: "בינוני",
  urgent: "דחוף",
};

function priorityDotClass(priority: PriorityDb): string {
  switch (priority) {
    case "urgent":
      return "bg-destructive";
    case "medium":
      return "bg-amber-500 dark:bg-amber-400";
    case "low":
      return "bg-muted-foreground";
  }
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from("orders_view")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !order) notFound();

  const o = order as OrderViewRow;

  const { data: items } = await supabase
    .from("order_items_view")
    .select("*")
    .eq("order_id", id);

  const lines = (items ?? []) as OrderItemViewRow[];

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-auto p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[min(100%,80rem)] flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              הזמנה #{o.order_number}
            </h2>
            <p className="text-muted-foreground text-sm">{o.customer_name}</p>
            <p className="text-muted-foreground text-sm">
              סטטוס: {orderStatusLabels[o.status]} · תעדוף:{ " "}
              <span className="inline-flex items-center gap-1.5 align-middle">
                <span
                  className={`size-1.5 shrink-0 rounded-full ${priorityDotClass(o.priority)}`}
                  aria-hidden
                />
                <span>{priorityLabels[o.priority]}</span>
              </span>
            </p>
            <p className="mt-2 text-sm tabular-nums">
              סכום כולל מע״מ:{" "}
              <span className="font-semibold text-foreground">
                {formatIls(o.total)}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/orders/${id}/edit`}>עריכת כותרת</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/orders">חזרה</Link>
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>אבן</TableHead>
                <TableHead>מידות</TableHead>
                <TableHead className="text-end">כמות</TableHead>
                <TableHead className="text-end">נפח</TableHead>
                <TableHead className="text-end">מחיר קו״ב</TableHead>
                <TableHead className="text-end">סכום שורה</TableHead>
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
