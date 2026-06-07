"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorDialog } from "@/components/error-dialog";

import {
  inventoryFinishLevelLabels,
  inventoryPieceTypeLabels,
} from "@/lib/db/inventory-taxonomy";
import {
  formatAreaM2,
  formatIls,
  formatIlsDense,
  formatMeters,
  formatVolumeM3,
  normalizeHex,
} from "@/lib/db/format";
import type { InventoryItemViewRow } from "@/lib/db/types";
import { deleteInventoryItem } from "./actions";

export type InventoryRow = InventoryItemViewRow;

const statusLabels: Record<InventoryRow["status"], string> = {
  available: "זמין",
  unavailable: "לא זמין",
  in_transit: "בדרך",
};

export function inventoryRowCanSelect(row: InventoryRow): boolean {
  return row.status === "available" && row.quantity_available > 0;
}

/** Labels for column visibility menu */
export const inventoryColumnLabels: Record<string, string> = {
  select: "בחירה",
  color_hex: "צבע",
  stone_name: "שם האבן",
  finish_level: "רמת גימור",
  piece_type: "חלק",
  dimensions: "מידות",
  quantity_total: "כמות במשלוח",
  quantity_available: "זמין",
  volumeM3: "נפח / שטח",
  price_per_m3: "מחיר לקו״ב / למ״ר",
  customer_price: "מחיר ללקוח",
  status: "סטטוס",
  actions: "פעולות",
};

function InventoryActions({ id }: { id: string }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDelete() {
    const res = await deleteInventoryItem(id);
    if (!res.ok) setErrorMessage(res.message);
    else window.location.reload();
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={() => setConfirmOpen(true)}
      >
        מחיקה
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="מחיקת פריט מלאי"
        description="למחוק או להפוך למלאי לא זמין?"
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

export const inventoryColumns: ColumnDef<InventoryRow>[] = [
  {
    id: "select",
    enableHiding: false,
    header: ({ table }) => {
      const selectableRows = table
        .getRowModel()
        .rows.filter((row) => row.getCanSelect());
      const allSelected =
        selectableRows.length > 0 &&
        selectableRows.every((row) => row.getIsSelected());
      const someSelected =
        selectableRows.some((row) => row.getIsSelected()) && !allSelected;

      return (
        <div
          className="flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            aria-label="בחר הכל"
            className="size-4 cursor-pointer accent-primary"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={(e) => {
              const checked = e.target.checked;
              for (const row of selectableRows) {
                row.toggleSelected(checked);
              }
            }}
          />
        </div>
      );
    },
    cell: ({ row }) => (
      <div
        className="flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          aria-label="בחר שורה"
          className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
        />
      </div>
    ),
  },
  {
    accessorKey: "color_hex",
    header: "צבע",
    cell: ({ row }) => {
      const hex = normalizeHex(row.original.color_hex);
      return (
        <div className="flex items-center gap-2">
          <span
            className="size-5 shrink-0 rounded border border-border shadow-sm"
            style={{ backgroundColor: hex }}
            title={hex}
          />
          <span>{hex.toUpperCase()}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "stone_name",
    header: "שם האבן",
  },
  {
    accessorKey: "finish_level",
    header: "רמת גימור",
    cell: ({ row }) =>
      inventoryFinishLevelLabels[row.original.finish_level],
  },
  {
    accessorKey: "piece_type",
    header: "חלק",
    cell: ({ row }) => inventoryPieceTypeLabels[row.original.piece_type],
  },
  {
    id: "dimensions",
    header: "מידות (מ׳)",
    accessorFn: (row) =>
      `${row.length_m}×${row.width_m}×${row.height_m}`,
    cell: ({ row }) => {
      const { length_m, width_m, height_m } = row.original;
      return (
        <span className="tabular-nums">
          {formatMeters(Number(length_m))}×{formatMeters(Number(width_m))}×
          {formatMeters(Number(height_m))}
        </span>
      );
    },
  },
  {
    accessorKey: "quantity_total",
    header: () => <div className="text-end">כמות במשלוח</div>,
    cell: ({ row }) => (
      <div className="text-end font-medium tabular-nums">
        {row.original.quantity_total}
      </div>
    ),
  },
  {
    accessorKey: "quantity_available",
    header: () => <div className="text-end">זמין</div>,
    cell: ({ row }) => (
      <div className="text-end font-medium tabular-nums">
        {row.original.quantity_available}
      </div>
    ),
  },
  {
    id: "volumeM3",
    header: () => <div className="text-end">נפח / שטח</div>,
    accessorFn: (row) =>
      (row.pricing_unit ?? "m3") === "m2"
        ? Number(row.area_m2)
        : Number(row.volume_m3),
    cell: ({ row }) => {
      const isM2 = (row.original.pricing_unit ?? "m3") === "m2";
      return (
        <div className="text-end font-medium tabular-nums">
          {isM2
            ? `${formatAreaM2(Number(row.original.area_m2))} מ״ר`
            : formatVolumeM3(Number(row.original.volume_m3))}
        </div>
      );
    },
  },
  {
    accessorKey: "price_per_m3",
    header: () => <div className="text-end">מחיר לקו״ב / למ״ר</div>,
    cell: ({ row }) => {
      const isM2 = (row.original.pricing_unit ?? "m3") === "m2";
      const price = isM2
        ? Number(row.original.price_per_m2)
        : Number(row.original.price_per_m3);
      return (
        <div className="text-end tabular-nums">
          {formatIlsDense(price)}
          {isM2 ? <span className="text-muted-foreground text-xs">/מ״ר</span> : null}
        </div>
      );
    },
  },
  {
    accessorKey: "customer_price",
    header: () => <div className="text-end">מחיר ללקוח</div>,
    cell: ({ row }) => {
      const isM2 = (row.original.pricing_unit ?? "m3") === "m2";
      const price = isM2
        ? Number(row.original.customer_price) * Number(row.original.height_m)
        : Number(row.original.customer_price);
      return (
        <div className="text-end font-medium tabular-nums">
          {formatIls(price)}
          {isM2 ? <span className="text-muted-foreground text-xs">/מ״ר</span> : null}
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "סטטוס",
    cell: ({ row }) => {
      const status = row.original.status;
      const variant =
        status === "available"
          ? "default"
          : status === "in_transit"
            ? "secondary"
            : "outline";
      return <Badge variant={variant}>{statusLabels[status]}</Badge>;
    },
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => {
      const id = row.original.id;
      return <InventoryActions id={id} />;
    },
  },
];
