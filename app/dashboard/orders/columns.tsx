"use client";

import { toast } from "sonner";
import { actionCrashed } from "@/lib/action-client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorDialog } from "@/components/error-dialog";
import { useCrmRole } from "@/components/role-context";

import type { OrderViewRow } from "@/lib/db/types";
import { orderStatusLabels as statusLabels, priorityLabels } from "@/lib/db/labels";
import { formatDateShort, formatIls, isPastDue } from "@/lib/db/format";
import { cn } from "@/lib/utils";
import { createDeliveryFromOrder } from "@/app/dashboard/deliveries/actions";
import { deleteOrder } from "./actions";

function PriorityBadge({ p }: { p: OrderViewRow["priority"] }) {
  const variant =
    p === "urgent" ? "destructive" : p === "medium" ? "secondary" : "outline";
  return <Badge variant={variant}>{priorityLabels[p]}</Badge>;
}

export const ordersColumnLabels: Record<string, string> = {
  order_number: "מס׳ הזמנה",
  document_date: "תאריך המסמך",
  customer_name: "לקוח",
  priority: "תעדוף",
  status: "סטטוס",
  supply_due_date: "יעד אספקה",
  totals: "סכום",
  signature_url: "חתימה",
  notes: "הערות",
  actions: "פעולות",
};

function OrderActions({ order }: { order: OrderViewRow }) {
  const router = useRouter();
  const { isAdmin } = useCrmRole();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deliveryConfirmOpen, setDeliveryConfirmOpen] = useState(false);

  const deleteDescription = order.has_delivery
    ? "למחוק את ההזמנה ואת תעודת המשלוח שלה? הכמויות יחזרו למלאי. פעולה זו לא ניתנת לביטול."
    : "למחוק את ההזמנה? המלאי שהוזמן ישוחרר. פעולה זו לא ניתנת לביטול.";

  async function handleDelete() {
    const res = await deleteOrder(order.id).catch(actionCrashed);
    if (!res.ok) {
      setErrorMessage(res.message);
      return;
    }
    toast.success(`הזמנה #${order.order_number} נמחקה`);
    router.refresh();
  }

  async function handleCreateDelivery() {
    const res = await createDeliveryFromOrder(order.id).catch(actionCrashed);
    if (!res.ok) {
      setErrorMessage(res.message);
      return;
    }
    toast.success("תעודת המשלוח נוצרה");
    router.push(`/dashboard/deliveries/${res.id}`);
  }

  const cannotDeliver = order.has_delivery || order.status === "cancelled";

  return (
    <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="outline"
        size="sm"
        type="button"
        disabled={cannotDeliver}
        title={
          order.has_delivery
            ? "כבר קיימת תעודת משלוח"
            : order.status === "cancelled"
              ? "ההזמנה בוטלה"
              : "צור תעודת משלוח"
        }
        onClick={() => setDeliveryConfirmOpen(true)}
      >
        צור תעודת משלוח
      </Button>
      {isAdmin ? (
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => setDeleteConfirmOpen(true)}
        >
          מחיקה
        </Button>
      ) : null}
      <ConfirmDialog
        open={deliveryConfirmOpen}
        onOpenChange={setDeliveryConfirmOpen}
        title={`תעודת משלוח להזמנה #${order.order_number}`}
        description="ליצור תעודת משלוח? הכמויות יועברו מ״מוזמן״ ל״סופק״ במלאי וכל פריטי ההזמנה יסומנו כהושלמו."
        confirmLabel="יצירת תעודה"
        pendingLabel="יוצר…"
        onConfirm={handleCreateDelivery}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`מחיקת הזמנה #${order.order_number}`}
        description={deleteDescription}
        confirmLabel="מחיקה"
        pendingLabel="מוחק…"
        confirmVariant="destructive"
        onConfirm={handleDelete}
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
    accessorKey: "document_date",
    header: "תאריך",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatDateShort(row.original.document_date ?? row.original.created_at)}
      </span>
    ),
  },
  {
    accessorKey: "customer_name",
    header: "לקוח",
    meta: { searchValue: (o) => o.customer_tax_id },
  },
  {
    accessorKey: "priority",
    header: "תעדוף",
    meta: { searchValue: (o) => priorityLabels[o.priority] },
    cell: ({ row }) => <PriorityBadge p={row.original.priority} />,
  },
  {
    accessorKey: "status",
    header: "סטטוס",
    meta: { searchValue: (o) => statusLabels[o.status] },
    cell: ({ row }) => (
      <span className="text-sm">{statusLabels[row.original.status]}</span>
    ),
  },
  {
    accessorKey: "supply_due_date",
    header: "יעד אספקה",
    cell: ({ row }) =>
      row.original.supply_due_date ? (
        <span
          className={cn(
            "tabular-nums",
            row.original.status !== "completed" && row.original.status !== "cancelled" &&
              isPastDue(row.original.supply_due_date) &&
              "font-medium text-destructive"
          )}
        >
          {formatDateShort(row.original.supply_due_date)}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "totals",
    accessorFn: (o) => Number(o.total),
    header: () => <div className="text-end">סכום</div>,
    cell: ({ row }) => (
      <div className="flex flex-col items-end gap-0.5">
        <span className="tabular-nums font-medium">
          {formatIls(row.original.total)}
        </span>
        <span className="text-muted-foreground text-xs">
          {row.original.vat_included ? "כולל מע״מ בפריטים" : "לפני מע״מ"}
          {Number(row.original.charges_total ?? 0) !== 0
            ? ` · חיובים ${formatIls(Number(row.original.charges_total))}`
            : ""}
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
    accessorKey: "notes",
    header: "הערות",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.notes ? (
        <span className="line-clamp-2 max-w-[16rem] text-sm text-muted-foreground">
          {row.original.notes}
        </span>
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
