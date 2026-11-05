"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateShort, formatIlsDense } from "@/lib/db/format";
import { expenseCategoryLabels, expenseDocumentTypeLabels } from "@/lib/db/labels";
import type { ExpenseViewRow } from "@/lib/db/types";

export type ExpenseTableRow = ExpenseViewRow;

export const expenseColumnLabels: Record<string, string> = {
  expense_date: "תאריך",
  supplier_name: "ספק",
  category: "קטגוריה",
  document_number: "מסמך",
  description: "תיאור",
  amount_before_vat: "לפני מע״מ",
  vat_amount: "מע״מ",
  amount_total: "סה״כ",
  is_paid: "שולם",
  green_invoice: "Green Invoice",
  actions: "פעולות",
};

function Money({ value }: { value: number | null }) {
  return (
    <div className="text-end tabular-nums">
      {value == null ? "—" : formatIlsDense(Number(value))}
    </div>
  );
}

export const expenseColumns: ColumnDef<ExpenseTableRow>[] = [
  {
    accessorKey: "expense_date",
    header: "תאריך",
    cell: ({ row }) => (
      <span className="tabular-nums">{formatDateShort(row.original.expense_date)}</span>
    ),
  },
  {
    accessorKey: "supplier_name",
    header: "ספק",
    cell: ({ row }) =>
      row.original.supplier_id ? (
        <span onClick={(e) => e.stopPropagation()}>
          <Link
            href={`/dashboard/suppliers/${row.original.supplier_id}`}
            className="hover:underline underline-offset-4"
          >
            {row.original.supplier_name}
          </Link>
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "category",
    header: "קטגוריה",
    cell: ({ row }) => expenseCategoryLabels[row.original.category],
  },
  {
    accessorKey: "document_number",
    header: "מסמך",
    cell: ({ row }) => (
      <span onClick={(e) => e.stopPropagation()}>
        <Link
          href={`/dashboard/expenses/${row.original.id}`}
          className="font-medium hover:underline underline-offset-4"
        >
          {expenseDocumentTypeLabels[row.original.document_type] ?? "מסמך"}
          {row.original.document_number ? (
            <span className="tabular-nums"> #{row.original.document_number}</span>
          ) : null}
        </Link>
      </span>
    ),
  },
  {
    accessorKey: "description",
    header: "תיאור",
    cell: ({ row }) => (
      <span className="block max-w-[14rem] truncate">{row.original.description ?? "—"}</span>
    ),
  },
  {
    accessorKey: "amount_before_vat",
    header: () => <div className="text-end">לפני מע״מ</div>,
    cell: ({ row }) => <Money value={row.original.amount_before_vat} />,
  },
  {
    accessorKey: "vat_amount",
    header: () => <div className="text-end">מע״מ</div>,
    cell: ({ row }) => <Money value={row.original.vat_amount} />,
  },
  {
    accessorKey: "amount_total",
    header: () => <div className="text-end">סה״כ</div>,
    cell: ({ row }) => (
      <div className="text-end font-medium tabular-nums">
        {formatIlsDense(Number(row.original.amount_total))}
      </div>
    ),
  },
  {
    accessorKey: "is_paid",
    header: "שולם",
    cell: ({ row }) => (
      <Badge variant={row.original.is_paid ? "secondary" : "outline"} className="font-normal">
        {row.original.is_paid ? "שולם" : "לא שולם"}
      </Badge>
    ),
  },
  {
    id: "green_invoice",
    header: "Green Invoice",
    cell: ({ row }) =>
      row.original.green_invoice_expense_id ? (
        <Badge variant="secondary" className="font-normal">
          נשלח
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/expenses/${row.original.id}`}>פתיחה</Link>
        </Button>
      </div>
    ),
  },
];
