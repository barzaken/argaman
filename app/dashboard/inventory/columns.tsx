"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorDialog } from "@/components/error-dialog";

import {
  inventoryFinishLevelLabels,
  inventoryPieceTypeLabels,
} from "@/lib/db/inventory-taxonomy";
import {
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

/** Labels for column visibility menu */
export const inventoryColumnLabels: Record<string, string> = {
  color_hex: "צבע",
  stone_name: "שם האבן",
  finish_level: "רמת גימור",
  piece_type: "חלק",
  dimensions: "מידות",
  quantity_total: "כמות במשלוח",
  quantity_available: "זמין",
  volumeM3: "נפח (קו״ב)",
  price_per_m3: "מחיר לקו״ב",
  customer_price: "מחיר ללקוח",
  status: "סטטוס",
  actions: "פעולות",
};

function InventoryActions({ id }: { id: string }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={async () => {
          if (!confirm("למחוק או להפוך למלאי לא זמין?")) return;
          const res = await deleteInventoryItem(id);
          if (!res.ok) setErrorMessage(res.message);
          else window.location.reload();
        }}
      >
        מחיקה
      </Button>
      <ErrorDialog
        message={errorMessage}
        onClose={() => setErrorMessage(null)}
      />
    </div>
  );
}

export const inventoryColumns: ColumnDef<InventoryRow>[] = [
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
    header: () => <div className="text-end">נפח (קו״ב)</div>,
    accessorFn: (row) => Number(row.volume_m3),
    cell: ({ getValue }) => (
      <div className="text-end font-medium tabular-nums">
        {formatVolumeM3(getValue() as number)}
      </div>
    ),
  },
  {
    accessorKey: "price_per_m3",
    header: () => <div className="text-end">מחיר לקו״ב</div>,
    cell: ({ row }) => (
      <div className="text-end tabular-nums">
        {formatIlsDense(Number(row.original.price_per_m3))}
      </div>
    ),
  },
  {
    accessorKey: "customer_price",
    header: () => <div className="text-end">מחיר ללקוח</div>,
    cell: ({ row }) => (
      <div className="text-end font-medium tabular-nums">
        {formatIls(Number(row.original.customer_price))}
      </div>
    ),
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
