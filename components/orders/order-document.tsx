"use client";

import Link from "next/link";
import { Heebo } from "next/font/google";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BRAND_CONTACT, BRAND_NAME } from "@/lib/brand";
import type { OrderItemViewRow, OrderViewRow, PriorityDb } from "@/lib/db/types";
import {
  formatDimensionsCmFromMeters,
  formatIls,
  formatIssueDate,
  formatVolumeM3,
} from "@/lib/db/format";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-heebo",
});

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

export type OrderDocumentCustomer = {
  tax_id: string;
  address: string | null;
  phone: string | null;
};

export function OrderDocument({
  order,
  customer,
  lines,
  orderId,
}: {
  order: OrderViewRow;
  customer: OrderDocumentCustomer;
  lines: OrderItemViewRow[];
  orderId: string;
}) {
  function handlePrint() {
    window.print();
  }

  return (
    <div
      className={`order-document flex flex-1 flex-col gap-6 overflow-auto p-4 md:p-6 ${heebo.variable}`}
    >
      <div className="mx-auto flex w-full max-w-[min(100%,80rem)] flex-col gap-6">
        <div className="no-print flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              הזמנה #{order.order_number}
            </h2>
            <p className="text-muted-foreground text-sm">{order.customer_name}</p>
            <p className="text-muted-foreground text-sm">
              תאריך יצירת הזמנה:{" "}
              <span className="tabular-nums text-foreground">
                {formatIssueDate(order.created_at)}
              </span>
            </p>
            <p className="text-muted-foreground text-sm">
              סטטוס: {orderStatusLabels[order.status]} · תעדוף:{" "}
              <span className="inline-flex items-center gap-1.5 align-middle">
                <span
                  className={`size-1.5 shrink-0 rounded-full ${priorityDotClass(order.priority)}`}
                  aria-hidden
                />
                <span>{priorityLabels[order.priority]}</span>
              </span>
            </p>
            <p className="mt-2 text-sm tabular-nums">
              סכום כולל מע״מ:{" "}
              <span className="font-semibold text-foreground">
                {formatIls(order.total)}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={handlePrint}
            >
              <Printer className="size-4" aria-hidden />
              הדפסה / PDF
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/orders/${orderId}/edit`}>עריכה</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/orders">חזרה</Link>
            </Button>
          </div>
        </div>

        <section
          dir="rtl"
          lang="he"
          className={`order-printable order-print-font rounded-md border bg-card p-6 ${heebo.className}`}
          aria-label="תעודת הזמנה"
        >
          <header className="order-print-header border-b border-border pb-4">
            <div className="text-center">
              <p className="text-xl font-bold tracking-tight text-foreground">
                {BRAND_NAME}
              </p>
              <h3 className="mt-2 text-base font-semibold text-foreground">
                תעודת הזמנה
              </h3>
              <p className="text-muted-foreground text-sm tabular-nums">
                הזמנה מס׳ {order.order_number}
              </p>
            </div>

            <div className="order-print-company mt-4 grid gap-1 text-center text-sm text-foreground">
              <p>
                <span className="font-medium">כתובת: </span>
                {BRAND_CONTACT.address}
              </p>
              <p className="tabular-nums">
                {BRAND_CONTACT.phones.map((p, i) => (
                  <span key={p.number}>
                    {i > 0 ? " · " : null}
                    <span className="font-medium">{p.label}</span> {p.number}
                  </span>
                ))}
              </p>
              <p>
                <span className="font-medium">מייל: </span>
                <span dir="ltr" className="inline-block">
                  {BRAND_CONTACT.email}
                </span>
              </p>
            </div>
          </header>

          <dl className="order-print-details mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">לקוח</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {order.customer_name}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ח.פ / ת.ז</dt>
              <dd className="mt-0.5 font-medium text-foreground tabular-nums">
                {customer.tax_id}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">כתובת לקוח</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {customer.address ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">טלפון לקוח</dt>
              <dd className="mt-0.5 font-medium text-foreground tabular-nums">
                {customer.phone ?? order.customer_phone ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">תאריך הנפקה</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {formatIssueDate(order.created_at)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">סטטוס</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {orderStatusLabels[order.status]}
              </dd>
            </div>
          </dl>

          <div className="order-print-table-wrap mt-6 overflow-hidden rounded-md border">
            <table className="order-print-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-3 py-2 text-start font-semibold">אבן</th>
                  <th className="px-3 py-2 text-start font-semibold">
                    מידות (ס״מ)
                  </th>
                  <th className="px-3 py-2 text-end font-semibold">כמות</th>
                  <th className="px-3 py-2 text-end font-semibold">נפח</th>
                  <th className="px-3 py-2 text-end font-semibold">מחיר קו״ב</th>
                  <th className="px-3 py-2 text-end font-semibold">סכום שורה</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((ln) => (
                  <tr key={ln.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2">{ln.stone_name}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatDimensionsCmFromMeters(
                        Number(ln.length_m),
                        Number(ln.width_m),
                        Number(ln.height_m)
                      )}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {ln.quantity}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {formatVolumeM3(Number(ln.volume_m3))}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {formatIls(Number(ln.price_per_m3))}
                    </td>
                    <td className="px-3 py-2 text-end font-medium tabular-nums">
                      {formatIls(Number(ln.line_subtotal))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="order-print-footer mt-6 flex flex-col items-start gap-1 text-sm tabular-nums">
            <p>
              <span className="text-muted-foreground">סכום לפני מע״מ: </span>
              <span className="font-medium">{formatIls(order.subtotal)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">מע״מ: </span>
              <span className="font-medium">{formatIls(order.vat_amount)}</span>
            </p>
            <p className="text-base">
              <span className="text-muted-foreground">סה״כ כולל מע״מ: </span>
              <span className="font-semibold">{formatIls(order.total)}</span>
            </p>
          </footer>
        </section>
      </div>
    </div>
  );
}
