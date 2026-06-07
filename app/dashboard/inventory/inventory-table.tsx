"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { RowSelectionState } from "@tanstack/react-table";

import { CrmDataTable } from "@/components/crm/data-table";
import { Button } from "@/components/ui/button";

import {
  inventoryColumnLabels,
  inventoryColumns,
  inventoryRowCanSelect,
  type InventoryRow,
} from "./columns";

export function InventoryTable({ data }: { data: InventoryRow[] }) {
  const router = useRouter();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const selectedIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([id, selected]) => {
          if (!selected) return false;
          const row = data.find((r) => r.id === id);
          return row != null && inventoryRowCanSelect(row);
        })
        .map(([id]) => id),
    [rowSelection, data]
  );

  function handleCreateOrder() {
    if (selectedIds.length === 0) return;
    router.push(`/dashboard/orders/new?inventory=${selectedIds.join(",")}`);
  }

  return (
    <CrmDataTable
      columns={inventoryColumns}
      data={data}
      filterColumnId="stone_name"
      filterPlaceholder="סנן לפי שם האבן..."
      columnLabels={inventoryColumnLabels}
      navigateRows="inventory-edit"
      enableRowSelection
      rowSelection={rowSelection}
      onRowSelectionChange={setRowSelection}
      getRowCanSelect={inventoryRowCanSelect}
      selectionActions={
        <Button type="button" size="sm" onClick={handleCreateOrder}>
          צור הזמנה ({selectedIds.length})
        </Button>
      }
    />
  );
}
