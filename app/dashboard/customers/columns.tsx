"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";

import type { Customer } from "./customers-demo-data";

const statusLabels: Record<Customer["status"], string> = {
  active: "פעיל",
  inactive: "לא פעיל",
  lead: "פוטנציאלי",
};

/** Labels for column visibility menu (keys match TanStack column ids). */
export const customerColumnLabels: Record<string, string> = {
  name: "שם",
  company: "חברה",
  email: "אימייל",
  phone: "טלפון",
  city: "עיר",
  status: "סטטוס",
  totalOrders: "הזמנות",
};

export const customerColumns: ColumnDef<Customer>[] = [
  {
    accessorKey: "name",
    header: "שם",
  },
  {
    accessorKey: "company",
    header: "חברה",
  },
  {
    accessorKey: "email",
    header: "אימייל",
    cell: ({ row }) => (
      <span className="tabular-nums">{row.getValue("email")}</span>
    ),
  },
  {
    accessorKey: "phone",
    header: "טלפון",
  },
  {
    accessorKey: "city",
    header: "עיר",
  },
  {
    accessorKey: "status",
    header: "סטטוס",
    cell: ({ row }) => {
      const status = row.getValue("status") as Customer["status"];
      const variant =
        status === "active"
          ? "default"
          : status === "lead"
            ? "secondary"
            : "outline";
      return <Badge variant={variant}>{statusLabels[status]}</Badge>;
    },
  },
  {
    accessorKey: "totalOrders",
    header: () => <div className="text-end">הזמנות</div>,
    cell: ({ row }) => (
      <div className="text-end font-medium tabular-nums">
        {row.getValue("totalOrders")}
      </div>
    ),
  },
];
