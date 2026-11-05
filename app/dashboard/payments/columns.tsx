"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import type { PaymentViewRow } from "@/lib/db/types";
import { formatDateShort, formatIls } from "@/lib/db/format";
import { paymentMethodLabels } from "@/lib/db/labels";

export const paymentsColumnLabels: Record<string, string> = {
  payment_number: "מס׳ תשלום",
  paid_at: "תאריך",
  customer_name: "לקוח",
  amount: "סכום",
  method: "אמצעי תשלום",
  reference: "אסמכתא",
  allocated_amount: "שויך",
  unallocated_amount: "זיכוי לא משויך",
  delivery_numbers: "תעודות משלוח",
  green_invoice_receipt_number: "קבלה (Green Invoice)",
};

const dash = <span className="text-muted-foreground">—</span>;

export const paymentsColumns: ColumnDef<PaymentViewRow>[] = [
  {
    accessorKey: "payment_number",
    header: () => <div className="text-end">מס׳</div>,
    cell: ({ row }) => (
      <div className="text-end">
        <Link
          href={`/dashboard/payments/${row.original.id}`}
          data-row-link
          className="tabular-nums font-medium text-primary underline-offset-4 hover:underline"
        >
          #{row.original.payment_number}
        </Link>
      </div>
    ),
  },
  {
    accessorKey: "paid_at",
    header: "תאריך",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatDateShort(row.original.paid_at)}
      </span>
    ),
  },
  {
    accessorKey: "customer_name",
    header: "לקוח",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span>{row.original.customer_name}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          ח.פ {row.original.customer_tax_id}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "amount",
    header: () => <div className="text-end">סכום</div>,
    cell: ({ row }) => (
      <div className="text-end tabular-nums font-medium">
        {formatIls(Number(row.original.amount))}
      </div>
    ),
  },
  {
    accessorKey: "method",
    header: "אמצעי",
    cell: ({ row }) => paymentMethodLabels[row.original.method] ?? row.original.method,
  },
  {
    accessorKey: "reference",
    header: "אסמכתא",
    cell: ({ row }) =>
      row.original.reference || row.original.bank_name ? (
        <div className="flex flex-col">
          <span className="tabular-nums" dir="auto">
            {row.original.reference ?? "—"}
          </span>
          {row.original.bank_name ? (
            <span className="text-muted-foreground text-xs">
              {row.original.bank_name}
            </span>
          ) : null}
        </div>
      ) : (
        dash
      ),
  },
  {
    accessorKey: "allocated_amount",
    header: () => <div className="text-end">שויך</div>,
    cell: ({ row }) => (
      <div className="text-end tabular-nums">
        {formatIls(Number(row.original.allocated_amount))}
      </div>
    ),
  },
  {
    accessorKey: "unallocated_amount",
    header: () => <div className="text-end">לא משויך</div>,
    cell: ({ row }) => {
      const v = Number(row.original.unallocated_amount);
      return (
        <div className="text-end">
          {v > 0.005 ? (
            <Badge variant="outline" className="tabular-nums">
              זיכוי {formatIls(v)}
            </Badge>
          ) : (
            dash
          )}
        </div>
      );
    },
  },
  {
    id: "delivery_numbers",
    accessorFn: (r) => (r.delivery_numbers ?? []).join(" "),
    header: "תעודות",
    cell: ({ row }) => {
      const nums = row.original.delivery_numbers ?? [];
      return nums.length ? (
        <span className="tabular-nums">
          {nums.map((n) => `#${n}`).join(", ")}
        </span>
      ) : (
        dash
      );
    },
  },
  {
    accessorKey: "green_invoice_receipt_number",
    header: "קבלה GI",
    cell: ({ row }) =>
      row.original.green_invoice_receipt_number ? (
        <span className="tabular-nums">
          {row.original.green_invoice_receipt_number}
        </span>
      ) : (
        dash
      ),
  },
];
