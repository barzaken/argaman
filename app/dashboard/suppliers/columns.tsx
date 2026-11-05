"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SupplierRow } from "@/lib/db/types";
import { formatIls } from "@/lib/db/format";

export type SupplierTableRow = SupplierRow & {
  expense_count: number;
  expense_total: number;
  unpaid_total: number;
};

export const supplierColumnLabels: Record<string, string> = {
  name: "שם הספק",
  tax_id: "ח.פ / ע.מ",
  phone: "טלפון",
  email: "דוא״ל",
  expense_count: "מס׳ הוצאות",
  expense_total: "סך הוצאות",
  unpaid_total: "לא שולם",
  actions: "פעולות",
};

export const supplierColumns: ColumnDef<SupplierTableRow>[] = [
  {
    accessorKey: "name",
    header: "שם הספק",
    cell: ({ row }) => (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Link
          href={`/dashboard/suppliers/${row.original.id}`}
          className="font-medium hover:underline underline-offset-4"
        >
          {row.original.name}
        </Link>
        {!row.original.is_active ? (
          <Badge variant="secondary" className="font-normal">
            בארכיון
          </Badge>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "tax_id",
    header: "ח.פ / ע.מ",
    cell: ({ row }) => (
      <span className="tabular-nums" dir="ltr">
        {row.original.tax_id ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "phone",
    header: "טלפון",
    cell: ({ row }) => (
      <span className="tabular-nums" dir="ltr">
        {row.original.phone ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "email",
    header: "דוא״ל",
    cell: ({ row }) => <span className="tabular-nums">{row.original.email ?? "—"}</span>,
  },
  {
    accessorKey: "expense_count",
    header: () => <div className="text-end">מס׳ הוצאות</div>,
    cell: ({ row }) => (
      <div className="text-end tabular-nums">{row.original.expense_count}</div>
    ),
  },
  {
    accessorKey: "expense_total",
    header: () => <div className="text-end">סך הוצאות</div>,
    cell: ({ row }) => (
      <div className="text-end font-medium tabular-nums">
        {formatIls(row.original.expense_total)}
      </div>
    ),
  },
  {
    accessorKey: "unpaid_total",
    header: () => <div className="text-end">לא שולם</div>,
    cell: ({ row }) => (
      <div className="text-end tabular-nums">
        {row.original.unpaid_total > 0 ? formatIls(row.original.unpaid_total) : "—"}
      </div>
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/suppliers/${row.original.id}`}>פתיחה</Link>
        </Button>
      </div>
    ),
  },
];
