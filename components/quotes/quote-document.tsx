"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  downloadQuoteDocumentPdf,
  printDocument,
} from "@/lib/orders/document-export";
import type { QuoteItemViewRow, QuoteViewRow } from "@/lib/db/types";
import { formatIls, formatIssueDate } from "@/lib/db/format";

import {
  QuoteDocumentSheet,
  type QuoteDocumentCustomer,
} from "./quote-document-sheet";

export type { QuoteDocumentCustomer };

const quoteStatusLabels: Record<QuoteViewRow["status"], string> = {
  open: "פתוחה",
  converted: "הומרה להזמנה",
  cancelled: "בוטלה",
};

export function QuoteDocument({
  quote,
  customer,
  lines,
  quoteId,
}: {
  quote: QuoteViewRow;
  customer: QuoteDocumentCustomer;
  lines: QuoteItemViewRow[];
  quoteId: string;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const canEdit = quote.status === "open";
  const canConvert = quote.status === "open" && !quote.has_order;

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
      await downloadQuoteDocumentPdf(el, quote.quote_number);
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
              הצעה #{quote.quote_number}
            </h2>
            <p className="text-muted-foreground text-sm">{quote.customer_name}</p>
            <p className="text-muted-foreground text-sm">
              תאריך יצירה:{" "}
              <span className="tabular-nums text-foreground">
                {formatIssueDate(quote.created_at)}
              </span>
            </p>
            <p className="text-muted-foreground text-sm">
              סטטוס: {quoteStatusLabels[quote.status]}
              {quote.valid_until ? (
                <>
                  {" "}
                  · תוקף:{" "}
                  <span className="tabular-nums text-foreground">
                    {formatIssueDate(quote.valid_until)}
                  </span>
                </>
              ) : null}
            </p>
            {quote.has_order && quote.converted_order_id ? (
              <p className="text-muted-foreground text-sm">
                הזמנה:{" "}
                <Link
                  href={`/dashboard/orders/${quote.converted_order_id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  #{quote.converted_order_number}
                </Link>
              </p>
            ) : null}
            <p className="mt-2 text-sm tabular-nums">
              סכום כולל מע״מ:{" "}
              <span className="font-semibold text-foreground">
                {formatIls(quote.total)}
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
            {canConvert ? (
              <Button variant="default" size="sm" asChild>
                <Link href={`/dashboard/quotes/${quoteId}/convert`}>
                  צור הזמנה
                </Link>
              </Button>
            ) : null}
            {canEdit ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/dashboard/quotes/${quoteId}/edit`}>עריכה</Link>
              </Button>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/quotes">חזרה</Link>
            </Button>
          </div>
        </div>

        {exportError ? (
          <p className="text-destructive text-sm" role="alert">
            {exportError}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <QuoteDocumentSheet
            ref={sheetRef}
            quote={quote}
            customer={customer}
            lines={lines}
          />
        </div>
      </div>
    </div>
  );
}
