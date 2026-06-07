"use client";

import Link from "next/link";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorDialog } from "@/components/error-dialog";

import type { OrderViewRow } from "@/lib/db/types";
import { formatIls } from "@/lib/db/format";
import { createDeliveryFromOrder } from "@/app/dashboard/deliveries/actions";
import { deleteOrder } from "./actions";

const priorityLabels: Record<OrderViewRow["priority"], string> = {
  low: "נמוך",
  medium: "בינוני",
  urgent: "דחוף",
};

const statusLabels: Record<OrderViewRow["status"], string> = {
  open: "פתוחה",
  in_production: "בייצור",
  ready_for_delivery: "מוכנה למשלוח",
  completed: "הושלמה",
  cancelled: "בוטלה",
};

function PriorityBadge({ p }: { p: OrderViewRow["priority"] }) {
  const variant =
    p === "urgent" ? "destructive" : p === "medium" ? "secondary" : "outline";
  return <Badge variant={variant}>{priorityLabels[p]}</Badge>;
}

export const ordersColumnLabels: Record<string, string> = {
  order_number: "מס׳ הזמנה",
  customer_name: "לקוח",
  priority: "תעדוף",
  status: "סטטוס",
  supply_due_date: "יעד אספקה",
  totals: "סכום",
  signature_url: "חתימה",
  actions: "פעולות",
};

function OrderActions({ order }: { order: OrderViewRow }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const deleteDescription = order.has_delivery
    ? "למחוק את ההזמנה ואת תעודת המשלוח? כמויות יוחזרו מהנגרע במלאי."
    : "למחוק את ההזמנה? משוחרר מלאי מזומן.";

  async function handleDelete() {
    const res = await deleteOrder(order.id);
    if (!res.ok) setErrorMessage(res.message);
    else window.location.reload();
  }

  return (
    <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="outline"
        size="sm"
        type="button"
        disabled={order.has_delivery}
        title={order.has_delivery ? "כבר קיימת תעודת משלוח" : "צור תעודת משלוח"}
        onClick={async () => {
          const res = await createDeliveryFromOrder(order.id);
          if (!res.ok) setErrorMessage(res.message);
          else window.location.href = `/dashboard/deliveries/${res.id}`;
        }}
      >
        צור תעודת משלוח
      </Button>
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={() => setDeleteConfirmOpen(true)}
      >
        מחיקה
      </Button>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="מחיקת הזמנה"
        description={deleteDescription}
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

export const ordersColumns: ColumnDef<OrderViewRow>[] = [
  {
    accessorKey: "order_number",
    header: () => <div className="text-end">מס׳</div>,
    cell: ({ row }) => (
      <div className="text-end font-medium tabular-nums">
        #{row.original.order_number}
      </div>
    ),
  },
  {
    accessorKey: "customer_name",
    header: "לקוח",
  },
  {
    accessorKey: "priority",
    header: "תעדוף",
    cell: ({ row }) => <PriorityBadge p={row.original.priority} />,
  },
  {
    accessorKey: "status",
    header: "סטטוס",
    cell: ({ row }) => (
      <span className="text-sm">{statusLabels[row.original.status]}</span>
    ),
  },
  {
    accessorKey: "supply_due_date",
    header: "יעד אספקה",
    cell: ({ row }) =>
      row.original.supply_due_date ?? (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "totals",
    header: () => <div className="text-end">סכום</div>,
    cell: ({ row }) => (
      <div className="flex flex-col items-end gap-0.5">
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
    accessorKey: "signature_url",
    header: "חתימה",
    cell: ({ row }) =>
      row.original.signature_url ? (
        <Link
          href={row.original.signature_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary text-sm underline-offset-4 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          קישור
        </Link>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => {
      const o = row.original;
      return <OrderActions order={o} />;
    },
  },
];
