"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";

import {
  computeVolumeM3,
  hexToHebrewColorName,
  type InventoryItem,
  type InventoryStatus,
} from "./inventory-demo-data";

const statusLabels: Record<InventoryStatus, string> = {
  available: "זמין",
  unavailable: "לא זמין",
  in_transit: "בדרך",
};

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const ilsDense = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatMeters(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    maximumFractionDigits: 3,
  }).format(n);
}

function formatVolumeM3(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

/** Labels for column visibility menu (keys match TanStack column ids). */
export const inventoryColumnLabels: Record<string, string> = {
  colorHex: "צבע",
  stoneName: "שם האבן",
  polishType: "סוג ליטוש",
  dimensions: "מידות",
  quantity: "כמות",
  volumeM3: "נפח (קו״ב)",
  pricePerM3: "מחיר לקו״ב",
  customerPrice: "מחיר ללקוח",
  status: "סטטוס",
};

export const inventoryColumns: ColumnDef<InventoryItem>[] = [
  {
    accessorKey: "colorHex",
    header: "צבע",
    cell: ({ row }) => {
      const hex = row.getValue("colorHex") as string;
      return (
        <div className="flex items-center gap-2">
          <span
            className="size-5 shrink-0 rounded border border-border shadow-sm"
            style={{ backgroundColor: hex }}
            title={hex}
          />
          <span>{hexToHebrewColorName(hex)}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "stoneName",
    header: "שם האבן",
  },
  {
    accessorKey: "polishType",
    header: "סוג ליטוש",
  },
  {
    id: "dimensions",
    header: "מידות (מ׳)",
    accessorFn: (row) =>
      `${row.lengthM}×${row.widthM}×${row.heightM}`,
    cell: ({ row }) => {
      const { lengthM, widthM, heightM } = row.original;
      return (
        <span className="tabular-nums">
          {formatMeters(lengthM)}×{formatMeters(widthM)}×{formatMeters(heightM)}
        </span>
      );
    },
  },
  {
    accessorKey: "quantity",
    header: () => <div className="text-end">כמות</div>,
    cell: ({ row }) => (
      <div className="text-end font-medium tabular-nums">
        {row.getValue("quantity")}
      </div>
    ),
  },
  {
    id: "volumeM3",
    header: () => <div className="text-end">נפח (קו״ב)</div>,
    accessorFn: (row) => computeVolumeM3(row),
    cell: ({ getValue }) => (
      <div className="text-end font-medium tabular-nums">
        {formatVolumeM3(getValue() as number)}
      </div>
    ),
  },
  {
    accessorKey: "pricePerM3",
    header: () => <div className="text-end">מחיר לקו״ב</div>,
    cell: ({ row }) => (
      <div className="text-end tabular-nums">{ilsDense.format(row.original.pricePerM3)}</div>
    ),
  },
  {
    accessorKey: "customerPrice",
    header: () => <div className="text-end">מחיר ללקוח</div>,
    cell: ({ row }) => (
      <div className="text-end font-medium tabular-nums">
        {ils.format(row.original.customerPrice)}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "סטטוס",
    cell: ({ row }) => {
      const status = row.getValue("status") as InventoryStatus;
      const variant =
        status === "available"
          ? "default"
          : status === "in_transit"
            ? "secondary"
            : "outline";
      return <Badge variant={variant}>{statusLabels[status]}</Badge>;
    },
  },
];
