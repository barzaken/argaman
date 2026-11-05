"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Download, ExternalLink, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DocumentChargeLine } from "@/components/orders/order-charge-rows";
import {
  downloadDeliveryDocumentPdf,
  printDocument,
} from "@/lib/orders/document-export";
import type { DeliveryItemRow, DeliveryViewRow } from "@/lib/db/types";
import { formatDateShort, formatIls, formatIssueDate } from "@/lib/db/format";

import { DeliveryDocumentSheet } from "./delivery-document-sheet";
import {
  deliveryStatusLabels,
  paymentMethodLabels,
  paymentStatusDisplay,
} from "@/lib/db/labels";

export function DeliveryDocument({
  delivery,
  lines,
  deliveryId,
  charges = [],
  orderNotes = null,
  greenInvoiceUrl = null,
  invoiceSlot = null,
  children,
}: {
  delivery: DeliveryViewRow;
  lines: DeliveryItemRow[];
  deliveryId: string;
  charges?: DocumentChargeLine[];
  orderNotes?: string | null;
  /** קישור למסמך ב-Green Invoice (מטבלת documents), אם יש */
  greenInvoiceUrl?: string | null;
  /** כפתור Green Invoice (חשבונית) — מוצג ליד כפתורי ההדפסה */
  invoiceSlot?: React.ReactNode;
  /** פאנלים מתחת לתעודה (תשלומים / מסמכים) — מחוץ לאזור ההדפסה */
  children?: React.ReactNode;
}) {
  const amountPaid = Number(delivery.amount_paid ?? 0);
  const balance = Number(delivery.balance ?? delivery.total);
  const paid = delivery.payment_status === "paid";
  const cancelled = delivery.status === "cancelled";
  const sheetRef = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handlePrint() {
    const el = sheetRef.current;
    if (!el) return;
    setExportError(null);
    setPrinting(true);
    try {
      await printDocument(el);
    } catch {
      setExportError("שגיאה בהדפסה. נסו שוב.");
    } finally {
      setPrinting(false);
    }
  }

  async function handleDownload() {
    const el = sheetRef.current;
    if (!el) return;
    setExportError(null);
    setDownloading(true);
    try {
      await downloadDeliveryDocumentPdf(el, delivery.delivery_number);
    } catch {
      setExportError("שגיאה בהורדת PDF. נסו שוב.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-auto p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[min(100%,80rem)] flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              תעודת משלוח #{delivery.delivery_number}
            </h2>
            <p className="text-muted-foreground text-sm">
              הזמנה #{delivery.order_number} · {delivery.customer_name}
            </p>
            <p className="text-muted-foreground text-sm">
              תאריך הנפקה / איסוף:{" "}
              <span className="tabular-nums text-foreground">
                {formatIssueDate(delivery.created_at)}
              </span>
            </p>
            <p className="text-muted-foreground text-sm">
              משלוח: {deliveryStatusLabels[delivery.status]}
              {delivery.payment_method
                ? ` · אמצעי תשלום: ${paymentMethodLabels[delivery.payment_method]}`
                : ""}
              {delivery.payment_due_date
                ? ` · יעד תשלום: ${formatDateShort(delivery.payment_due_date)}`
                : ""}
            </p>

            <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-sm sm:w-[28rem]">
              <div className="flex flex-col gap-0.5 bg-card px-3 py-2">
                <dt className="text-muted-foreground text-xs">סכום כולל מע״מ</dt>
                <dd className="font-semibold tabular-nums text-foreground">
                  {formatIls(delivery.total)}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 bg-card px-3 py-2">
                <dt className="text-muted-foreground text-xs">שולם</dt>
                <dd className="font-semibold tabular-nums text-foreground">
                  {formatIls(amountPaid)}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 bg-card px-3 py-2">
                <dt className="text-muted-foreground text-xs">יתרה לתשלום</dt>
                <dd
                  className={
                    balance > 0.005 && !cancelled
                      ? "font-semibold tabular-nums text-destructive"
                      : "font-semibold tabular-nums text-foreground"
                  }
                >
                  {formatIls(Math.max(balance, 0))}
                </dd>
              </div>
            </dl>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={paid ? "secondary" : amountPaid > 0 ? "outline" : "destructive"}>
                {paymentStatusDisplay(delivery)}
              </Badge>
              {delivery.paid_at ? (
                <span className="text-muted-foreground text-xs">
                  תשלום אחרון: {formatDateShort(delivery.paid_at)}
                </span>
              ) : null}
            </div>
            {delivery.green_invoice_id || greenInvoiceUrl ? (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  Green Invoice
                  {delivery.green_invoice_id ? (
                    <>
                      :{" "}
                      <span className="tabular-nums text-foreground" dir="ltr">
                        {delivery.green_invoice_id}
                      </span>
                    </>
                  ) : null}
                </span>
                {greenInvoiceUrl ? (
                  <a
                    href={greenInvoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                  >
                    פתיחת המסמך
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {invoiceSlot}
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={printing || downloading}
              onClick={() => void handlePrint()}
            >
              <Printer data-icon="inline-start" aria-hidden />
              {printing ? "מדפיס…" : "הדפסה"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={printing || downloading}
              onClick={() => void handleDownload()}
            >
              <Download data-icon="inline-start" aria-hidden />
              {downloading ? "מוריד…" : "הורדת PDF"}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/deliveries/${deliveryId}/edit`}>
                עריכה
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/orders/${delivery.order_id}`}>
                הזמנה #{delivery.order_number}
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/deliveries">חזרה</Link>
            </Button>
          </div>
        </div>

        {exportError ? (
          <p className="text-destructive text-sm" role="alert">
            {exportError}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <DeliveryDocumentSheet
            ref={sheetRef}
            delivery={delivery}
            lines={lines}
            charges={charges}
            orderNotes={orderNotes}
          />
        </div>

        {children}
      </div>
    </div>
  );
}
