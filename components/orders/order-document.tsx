"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Download, Printer, Truck } from "lucide-react";
import { toast } from "sonner";

import { createDeliveryFromOrder } from "@/app/dashboard/deliveries/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorDialog } from "@/components/error-dialog";
import { MorningIssueLink } from "@/components/green-invoice/morning-issue-link";
import { Button } from "@/components/ui/button";
import { actionCrashed } from "@/lib/action-client";
import {
  downloadOrderDocumentPdf,
  printOrderDocument,
} from "@/lib/orders/document-export";
import type { OrderItemViewRow, OrderViewRow, PriorityDb } from "@/lib/db/types";
import { formatDateShort, formatIls, formatIssueDate } from "@/lib/db/format";
import { orderChargeKindLabels } from "@/lib/db/labels";

import {
  OrderDocumentSheet,
  type OrderDocumentCustomer,
} from "./order-document-sheet";
import type { DocumentChargeLine } from "./order-charge-rows";

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
  charges = [],
  delivery = null,
  children,
}: {
  order: OrderViewRow;
  customer: OrderDocumentCustomer;
  lines: OrderItemViewRow[];
  orderId: string;
  charges?: DocumentChargeLine[];
  /** תעודת המשלוח של ההזמנה, אם כבר הופקה */
  delivery?: { id: string; delivery_number: number } | null;
  /** פאנלים מתחת להזמנה (מסמכים) — מחוץ לאזור ההדפסה */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [deliveryConfirmOpen, setDeliveryConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleCreateDelivery() {
    const res = await createDeliveryFromOrder(orderId).catch(actionCrashed);
    if (!res.ok) {
      setActionError(res.message);
      return;
    }
    toast.success("תעודת המשלוח נוצרה");
    router.push(`/dashboard/deliveries/${res.id}`);
  }

  const hasDelivery = delivery != null || order.has_delivery;
  const cancelled = order.status === "cancelled";
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
              תאריך המסמך:{" "}
              <span className="tabular-nums text-foreground">
                {formatDateShort(order.document_date)}
              </span>
              {order.document_date &&
              formatDateShort(order.document_date) !==
                formatDateShort(order.created_at) ? (
                <span>
                  {" "}
                  · נוצרה במערכת: {formatIssueDate(order.created_at)}
                </span>
              ) : null}
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
            {charges.length > 0 ? (
              <p className="text-muted-foreground text-sm">
                חיובים נוספים:{" "}
                {charges
                  .map(
                    (c) =>
                      `${orderChargeKindLabels[c.kind]} ${formatIls(Number(c.amount))}`
                  )
                  .join(" · ")}{" "}
                (לפני מע״מ)
              </p>
            ) : null}
            {delivery ? (
              <p className="text-sm">
                <Link
                  href={`/dashboard/deliveries/${delivery.id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  תעודת משלוח #{delivery.delivery_number}
                </Link>
              </p>
            ) : null}
            {order.notes?.trim() ? (
              <p className="mt-2 max-w-xl whitespace-pre-line rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                <span className="text-muted-foreground">הערות: </span>
                {order.notes}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {hasDelivery ? null : (
              <Button
                size="sm"
                type="button"
                disabled={cancelled}
                title={cancelled ? "ההזמנה בוטלה" : undefined}
                onClick={() => setDeliveryConfirmOpen(true)}
              >
                <Truck data-icon="inline-start" aria-hidden />
                צור תעודת משלוח
              </Button>
            )}
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
            <MorningIssueLink params={{ order: orderId }} />
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
            charges={charges}
          />
        </div>

        {children}
      </div>
      <ConfirmDialog
        open={deliveryConfirmOpen}
        onOpenChange={setDeliveryConfirmOpen}
        title={`תעודת משלוח להזמנה #${order.order_number}`}
        description="ליצור תעודת משלוח? הכמויות יועברו מ״מוזמן״ ל״סופק״ במלאי וכל פריטי ההזמנה יסומנו כהושלמו. אחרי ההפקה לא ניתן לשנות את החיובים הנוספים."
        confirmLabel="יצירת תעודה"
        pendingLabel="יוצר…"
        onConfirm={handleCreateDelivery}
      />
      <ErrorDialog message={actionError} onClose={() => setActionError(null)} />
    </div>
  );
}
