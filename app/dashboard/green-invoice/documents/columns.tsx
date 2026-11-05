"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDateShort, formatIls } from "@/lib/db/format";
import { documentKindLabels } from "@/lib/db/labels";
import type { DocumentViewRow } from "@/lib/db/types";
import { giDocTypeName } from "@/lib/green-invoice/document-types";

export const morningColumnLabels: Record<string, string> = {
  type: "סוג",
  document_number: "מס׳",
  document_date: "תאריך",
  counterparty: "צד שני",
  amount_total: "סכום",
  linked: "מקושר ל",
  actions: "פעולות",
};

const dash = <span className="text-muted-foreground">—</span>;

function money(r: DocumentViewRow) {
  if (r.amount_total == null) return null;
  const n = Number(r.amount_total);
  return r.currency === "ILS" || !r.currency ? formatIls(n) : `${n.toLocaleString("he-IL")} ${r.currency}`;
}

export const morningColumns: ColumnDef<DocumentViewRow>[] = [
  {
    id: "type",
    accessorFn: (r) => (r.green_invoice_type ? giDocTypeName(r.green_invoice_type) : documentKindLabels[r.kind]),
    header: "סוג",
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.green_invoice_type ? giDocTypeName(row.original.green_invoice_type) : documentKindLabels[row.original.kind]}
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
      row.original.document_date ? <span className="tabular-nums">{formatDateShort(row.original.document_date)}</span> : dash,
  },
  {
    id: "counterparty",
    accessorFn: (r) => `${r.counterparty_name ?? ""} ${r.counterparty_tax_id ?? ""} ${r.customer_name ?? ""} ${r.supplier_name ?? ""}`,
    header: "צד שני",
    cell: ({ row }) => {
      const r = row.original;
      const name = r.counterparty_name ?? r.customer_name ?? r.supplier_name;
      return name ? <span className="truncate">{name}</span> : dash;
    },
  },
  {
    accessorKey: "amount_total",
    header: () => <div className="text-end">סכום</div>,
    cell: ({ row }) => <div className="text-end font-medium tabular-nums">{money(row.original) ?? dash}</div>,
  },
  {
    id: "linked",
    header: "מקושר ל",
    cell: ({ row }) => {
      const r = row.original;
      const l =
        r.delivery_id && r.delivery_number != null
          ? { label: `משלוח #${r.delivery_number}`, href: `/dashboard/deliveries/${r.delivery_id}` }
          : r.order_id && r.order_number != null
            ? { label: `הזמנה #${r.order_number}`, href: `/dashboard/orders/${r.order_id}` }
            : r.payment_id && r.payment_number != null
              ? { label: `תשלום #${r.payment_number}`, href: `/dashboard/payments/${r.payment_id}` }
              : null;
      return l ? (
        <Link href={l.href} className="text-sm hover:underline" onClick={(e) => e.stopPropagation()}>
          {l.label}
        </Link>
      ) : (
        dash
      );
    },
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div className="flex justify-end gap-2" data-row-href={`/dashboard/documents/${row.original.id}`}>
        {row.original.green_invoice_url ? (
          <Button variant="outline" size="sm" asChild>
            <a href={row.original.green_invoice_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              PDF
              <ExternalLink className="opacity-60" aria-hidden />
            </a>
          </Button>
        ) : null}
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/documents/${row.original.id}`}>פתיחה</Link>
        </Button>
      </div>
    ),
  },
];
