"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Paperclip } from "lucide-react";

import { DocumentStatusBadge } from "@/components/documents/document-badges";
import { Button } from "@/components/ui/button";
import { formatDateShort, formatIls } from "@/lib/db/format";
import { documentKindLabels, documentSourceLabels } from "@/lib/db/labels";
import type { DocumentViewRow } from "@/lib/db/types";

export const documentsColumnLabels: Record<string, string> = {
  status: "סטטוס",
  kind: "סוג",
  document_number: "מס׳ מסמך",
  document_date: "תאריך",
  counterparty_name: "צד שני",
  amount_total: "סכום",
  linked: "מקושר ל",
  source: "מקור",
  actions: "פעולות",
};

const dash = <span className="text-muted-foreground">—</span>;

function linkedSummary(r: DocumentViewRow): { label: string; href: string } | null {
  if (r.customer_id && r.customer_name)
    return { label: `לקוח: ${r.customer_name}`, href: `/dashboard/customers/${r.customer_id}` };
  if (r.supplier_id && r.supplier_name)
    return { label: `ספק: ${r.supplier_name}`, href: `/dashboard/suppliers/${r.supplier_id}` };
  if (r.delivery_id && r.delivery_number != null)
    return { label: `משלוח #${r.delivery_number}`, href: `/dashboard/deliveries/${r.delivery_id}` };
  if (r.order_id && r.order_number != null)
    return { label: `הזמנה #${r.order_number}`, href: `/dashboard/orders/${r.order_id}` };
  if (r.payment_id && r.payment_number != null)
    return { label: `תשלום #${r.payment_number}`, href: `/dashboard/payments/${r.payment_id}` };
  return null;
}

export const documentsColumns: ColumnDef<DocumentViewRow>[] = [
  {
    accessorKey: "status",
    header: "סטטוס",
    cell: ({ row }) => <DocumentStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "kind",
    header: "סוג",
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5 text-sm">
        {documentKindLabels[row.original.kind] ?? row.original.kind}
        {row.original.storage_path ? (
          <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="יש קובץ" />
        ) : null}
      </span>
    ),
  },
  {
    accessorKey: "document_number",
    header: "מס׳",
    cell: ({ row }) =>
      row.original.document_number ? (
        <Link
          href={`/dashboard/documents/${row.original.id}`}
          className="font-medium tabular-nums hover:underline"
          dir="ltr"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.document_number}
        </Link>
      ) : (
        dash
      ),
  },
  {
    accessorKey: "document_date",
    header: "תאריך",
    cell: ({ row }) =>
      row.original.document_date ? (
        <span className="tabular-nums">{formatDateShort(row.original.document_date)}</span>
      ) : (
        dash
      ),
  },
  {
    id: "counterparty_name",
    accessorFn: (r) => `${r.counterparty_name ?? ""} ${r.counterparty_tax_id ?? ""} ${r.customer_name ?? ""} ${r.supplier_name ?? ""}`,
    header: "צד שני",
    cell: ({ row }) => {
      const r = row.original;
      const name = r.counterparty_name ?? r.supplier_name ?? r.customer_name;
      if (!name && !r.counterparty_tax_id) return dash;
      return (
        <div className="min-w-0">
          <p className="truncate">{name ?? "—"}</p>
          {r.counterparty_tax_id ? (
            <p className="text-muted-foreground text-xs tabular-nums">ח.פ {r.counterparty_tax_id}</p>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: "amount_total",
    header: () => <div className="text-end">סכום</div>,
    cell: ({ row }) =>
      row.original.amount_total != null ? (
        <div className="text-end tabular-nums font-medium">
          {row.original.currency === "ILS" || !row.original.currency
            ? formatIls(Number(row.original.amount_total))
            : `${Number(row.original.amount_total).toLocaleString("he-IL")} ${row.original.currency}`}
        </div>
      ) : (
        <div className="text-end">{dash}</div>
      ),
  },
  {
    id: "linked",
    header: "מקושר ל",
    cell: ({ row }) => {
      const l = linkedSummary(row.original);
      return l ? (
        <Link
          href={l.href}
          className="text-sm hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {l.label}
        </Link>
      ) : (
        dash
      );
    },
  },
  {
    accessorKey: "source",
    header: "מקור",
    cell: ({ row }) => (
      <span className="text-sm">{documentSourceLabels[row.original.source] ?? row.original.source}</span>
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div data-row-href={`/dashboard/documents/${row.original.id}`}>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/documents/${row.original.id}`}>פתיחה</Link>
        </Button>
      </div>
    ),
  },
];
