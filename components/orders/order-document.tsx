"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  downloadOrderDocumentPdf,
  printOrderDocument,
} from "@/lib/orders/document-export";
import type { OrderItemViewRow, OrderViewRow, PriorityDb } from "@/lib/db/types";
import { formatIls, formatIssueDate } from "@/lib/db/format";

import {
  OrderDocumentSheet,
  type OrderDocumentCustomer,
} from "./order-document-sheet";

export type { OrderDocumentCustomer };

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
      await printOrderDocument(el);
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
      await downloadOrderDocumentPdf(el, order.order_number);
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
              disabled={printing || downloading}
              onClick={() => void handlePrint()}
            >
              <Printer className="size-4" aria-hidden />
              {printing ? "מדפיס…" : "הדפסה"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={printing || downloading}
              onClick={() => void handleDownload()}
            >
              <Download className="size-4" aria-hidden />
              {downloading ? "מוריד…" : "הורדת PDF"}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/orders/${orderId}/edit`}>עריכה</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/orders">חזרה</Link>
            </Button>
          </div>
        </div>

        {exportError ? (
          <p className="text-destructive text-sm" role="alert">
            {exportError}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <OrderDocumentSheet
            ref={sheetRef}
            order={order}
            customer={customer}
            lines={lines}
          />
        </div>
      </div>
    </div>
  );
}
