"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorDialog } from "@/components/error-dialog";

import type { QuoteViewRow } from "@/lib/db/types";
import { formatIls } from "@/lib/db/format";
import { deleteQuote } from "./actions";

const statusLabels: Record<QuoteViewRow["status"], string> = {
  open: "פתוחה",
  converted: "הומרה להזמנה",
  cancelled: "בוטלה",
};

function StatusBadge({ status }: { status: QuoteViewRow["status"] }) {
  const variant =
    status === "converted"
      ? "secondary"
      : status === "cancelled"
        ? "outline"
        : "default";
  return <Badge variant={variant}>{statusLabels[status]}</Badge>;
}

export const quotesColumnLabels: Record<string, string> = {
  quote_number: "מס׳ הצעה",
  customer_name: "לקוח",
  status: "סטטוס",
  valid_until: "תוקף",
  totals: "סכום",
  actions: "פעולות",
};

function QuoteActions({ quote }: { quote: QuoteViewRow }) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const canConvert = quote.status === "open" && !quote.has_order;
  const canDelete = quote.status !== "converted";

  async function handleDelete() {
    const res = await deleteQuote(quote.id);
    if (!res.ok) setErrorMessage(res.message);
    else window.location.reload();
  }

  return (
    <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="outline"
        size="sm"
        type="button"
        disabled={!canConvert}
        title={
          canConvert
            ? "צור הזמנה מהצעה"
            : quote.has_order
              ? "כבר נוצרה הזמנה"
              : "לא ניתן להמיר הצעה זו"
        }
        onClick={() => router.push(`/dashboard/quotes/${quote.id}/convert`)}
      >
        צור הזמנה
      </Button>
      {quote.has_order && quote.converted_order_id ? (
        <Button variant="outline" size="sm" type="button" asChild>
          <Link href={`/dashboard/orders/${quote.converted_order_id}`}>
            הזמנה #{quote.converted_order_number}
          </Link>
        </Button>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        type="button"
        disabled={!canDelete}
        onClick={() => setDeleteConfirmOpen(true)}
      >
        מחיקה
      </Button>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="מחיקת הצעת מחיר"
        description="למחוק את הצעת המחיר? פעולה זו לא ניתנת לביטול."
        confirmLabel="מחיקה"
        confirmVariant="destructive"
        onConfirm={() => void handleDelete()}
      />
      <ErrorDialog
        message={errorMessage}
        onClose={() => setErrorMessage(null)}
      />
    </div>
  );
}

export const quotesColumns: ColumnDef<QuoteViewRow>[] = [
  {
    accessorKey: "quote_number",
    header: () => <div className="text-start">מס׳</div>,
    cell: ({ row }) => (
      <div className="text-start font-medium tabular-nums">
        #{row.original.quote_number}
      </div>
    ),
  },
  {
    accessorKey: "customer_name",
    header: () => <div className="text-start">לקוח</div>,
    cell: ({ row }) => (
      <div className="text-start">{row.original.customer_name}</div>
    ),
  },
  {
    accessorKey: "status",
    header: () => <div className="text-start">סטטוס</div>,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "valid_until",
    header: () => <div className="text-start">תוקף</div>,
    cell: ({ row }) =>
      row.original.valid_until ?? (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "totals",
    header: () => <div className="text-start">סכום</div>,
    cell: ({ row }) => (
      <div className="flex flex-col items-start gap-0.5">
        <span className="tabular-nums font-medium">
          {formatIls(row.original.total)}
        </span>
        <span className="text-muted-foreground text-xs">
          {row.original.vat_included ? "כולל מע״מ בפריטים" : "לפני מע״מ"}
        </span>
      </div>
    ),
  },
  {
    id: "actions",
    header: () => <div className="text-end"></div>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <QuoteActions quote={row.original} />
      </div>
    ),
  },
];
