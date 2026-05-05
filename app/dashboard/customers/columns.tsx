"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";

import type { CustomerRow } from "@/lib/db/types";
import { formatIls } from "@/lib/db/format";

export type CustomerTableRow = CustomerRow & {
  order_count: number;
  unpaid_balance: number;
};

export const customerColumnLabels: Record<string, string> = {
  name: "שם",
  tax_id: "ח.פ / ת״ז",
  email: "דוא״ל",
  phone: "טלפון",
  address: "כתובת",
  order_count: "הזמנות",
  unpaid_balance: "יתרה פתוחה",
  actions: "פעולות",
};

export const customerColumns: ColumnDef<CustomerTableRow>[] = [
  {
    accessorKey: "name",
    header: "שם",
  },
  {
    accessorKey: "tax_id",
    header: "ח.פ / ת״ז",
    cell: ({ row }) => (
      <span className="tabular-nums">{row.getValue("tax_id")}</span>
    ),
  },
  {
    accessorKey: "email",
    header: "דוא״ל",
    cell: ({ row }) => (
      <span className="tabular-nums">{row.getValue("email") ?? "—"}</span>
    ),
  },
  {
    accessorKey: "phone",
    header: "טלפון",
    cell: ({ row }) => (
      <span className="tabular-nums">{row.getValue("phone") ?? "—"}</span>
    ),
  },
  {
    accessorKey: "address",
    header: "כתובת",
    cell: ({ row }) => (
      <span className="max-w-[12rem] truncate">
        {(row.getValue("address") as string | null) ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "order_count",
    header: () => <div className="text-end">הזמנות</div>,
    cell: ({ row }) => (
      <div className="text-end font-medium tabular-nums">
        {row.original.order_count}
      </div>
    ),
  },
  {
    accessorKey: "unpaid_balance",
    header: () => <div className="text-end">יתרה פתוחה</div>,
    cell: ({ row }) => (
      <div className="text-end font-medium tabular-nums">
        {formatIls(row.original.unpaid_balance)}
      </div>
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/customers/${row.original.id}/edit`}>
            עריכה
          </Link>
        </Button>
      </div>
    ),
  },
];
