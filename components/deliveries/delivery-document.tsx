"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  downloadDeliveryDocumentPdf,
  printDocument,
} from "@/lib/orders/document-export";
import type { DeliveryItemRow, DeliveryViewRow } from "@/lib/db/types";
import { formatIls, formatIssueDate } from "@/lib/db/format";

import { DeliveryDocumentSheet } from "./delivery-document-sheet";

const deliveryStatusLabels: Record<DeliveryViewRow["status"], string> = {
  waiting_for_pickup: "ממתין לאיסוף",
  in_transit: "בדרך",
  delivered: "נמסר",
  cancelled: "בוטל",
};

const paymentStatusLabels: Record<DeliveryViewRow["payment_status"], string> = {
  unpaid: "לא שולם",
  paid: "שולם",
};

const paymentMethodLabels: Record<
  NonNullable<DeliveryViewRow["payment_method"]>,
  string
> = {
  cash: "מזומן",
  bank_transfer: "העברה בנקאית",
  check: "צ׳ק",
  credit_card: "כרטיס אשראי",
  other: "אחר",
};

export function DeliveryDocument({
  delivery,
  lines,
  deliveryId,
}: {
  delivery: DeliveryViewRow;
  lines: DeliveryItemRow[];
  deliveryId: string;
}) {
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
              משלוח: {deliveryStatusLabels[delivery.status]} · תשלום:{" "}
              {paymentStatusLabels[delivery.payment_status]}
              {delivery.payment_method
                ? ` · ${paymentMethodLabels[delivery.payment_method]}`
                : ""}
            </p>
            <p className="mt-2 text-sm tabular-nums">
              סכום כולל מע״מ:{" "}
              <span className="font-semibold text-foreground">
                {formatIls(delivery.total)}
              </span>
            </p>
            {delivery.green_invoice_id ? (
              <p className="text-muted-foreground text-sm tabular-nums">
                Green Invoice: {delivery.green_invoice_id}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
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
          />
        </div>
      </div>
    </div>
  );
}
