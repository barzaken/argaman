"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { DeliveryViewRow } from "@/lib/db/types";
import { formatIls } from "@/lib/db/format";

const payLabels: Record<DeliveryViewRow["payment_status"], string> = {
  unpaid: "לא שולם",
  paid: "שולם",
};

const deliveryStatusLabels: Record<DeliveryViewRow["status"], string> = {
  waiting_for_pickup: "ממתין לאיסוף",
  in_transit: "בדרך",
  delivered: "נמסר",
  cancelled: "בוטל",
};

export const deliveriesColumnLabels: Record<string, string> = {
  delivery_number: "מס׳ משלוח",
  order_number: "מס׳ הזמנה",
  customer_name: "לקוח",
  fulfillment_method: "אספקה",
  shipping_address: "כתובת",
  delivered_at: "תאריך מסירה",
  payment_method: "תשלום",
  payment_due_date: "יעד תשלום",
  green_invoice_id: "Green Invoice",
  payment_status: "סטטוס תשלום",
  total: "סכום",
  actions: "פעולות",
};

export const deliveriesColumns: ColumnDef<DeliveryViewRow>[] = [
  {
    accessorKey: "delivery_number",
    header: () => <div className="text-end">מס׳</div>,
    cell: ({ row }) => (
      <div className="text-end tabular-nums font-medium">
        #{row.original.delivery_number}
      </div>
    ),
  },
  {
    accessorKey: "order_number",
    header: () => <div className="text-end">הזמנה</div>,
    cell: ({ row }) => (
      <div className="text-end tabular-nums">
        #{row.original.order_number}
      </div>
    ),
  },
  {
    accessorKey: "customer_name",
    header: "לקוח",
  },
  {
    accessorKey: "fulfillment_method",
    header: "אספקה",
    cell: ({ row }) =>
      row.original.fulfillment_method === "shipping" ? "שילוח" : "איסוף",
  },
  {
    accessorKey: "shipping_address",
    header: "כתובת",
    cell: ({ row }) =>
      row.original.shipping_address ?? (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "delivered_at",
    header: "מסירה",
    cell: ({ row }) =>
      row.original.delivered_at ?? (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "payment_method",
    header: "מזומן",
    cell: ({ row }) =>
      row.original.payment_method ?? (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "payment_due_date",
    header: "יעד תשלום",
    cell: ({ row }) =>
      row.original.payment_due_date ?? (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "green_invoice_id",
    header: "GI",
    cell: ({ row }) =>
      row.original.green_invoice_id ?? (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "payment_status",
    header: "שולם?",
    cell: ({ row }) => {
      const st = row.original.payment_status;
      return (
        <Badge variant={st === "paid" ? "secondary" : "destructive"}>
          {payLabels[st]}
        </Badge>
      );
    },
  },
  {
    accessorKey: "status",
    header: "משלוח",
    cell: ({ row }) => (
      <span className="text-sm">
        {deliveryStatusLabels[row.original.status]}
      </span>
    ),
  },
  {
    accessorKey: "total",
    header: () => <div className="text-end">סכום</div>,
    cell: ({ row }) => (
      <div className="text-end tabular-nums font-medium">
        {formatIls(Number(row.original.total))}
      </div>
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/deliveries/${row.original.id}/edit`}>
            עריכה
          </Link>
        </Button>
      </div>
    ),
  },
];
