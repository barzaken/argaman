"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type {
  ColumnDef,
  ColumnFiltersState,
  OnChangeFn,
  RowSelectionState,
  VisibilityState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type CrmRowNavigateKind =
  | "inventory-edit"
  | "order-detail"
  | "delivery-detail"
  | "customer-detail";

function rowHrefFromKind(kind: CrmRowNavigateKind, id: string): string {
  switch (kind) {
    case "inventory-edit":
      return `/dashboard/inventory/${id}/edit`;
    case "order-detail":
      return `/dashboard/orders/${id}`;
    case "delivery-detail":
      return `/dashboard/deliveries/${id}`;
    case "customer-detail":
      return `/dashboard/customers/${id}`;
  }
}

export type CrmDataTableProps<
  TData extends { id: string },
  TValue,
> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  filterColumnId?: string;
  filterPlaceholder?: string;
  columnLabels?: Record<string, string>;
  /** Opens detail/edit on row click (interactive cells use stopPropagation). */
  navigateRows?: CrmRowNavigateKind;
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  getRowCanSelect?: (row: TData) => boolean;
  selectionActions?: React.ReactNode;
};

export function CrmDataTable<
  TData extends { id: string },
  TValue,
>({
  columns,
  data,
  filterColumnId,
  filterPlaceholder = "סנן…",
  columnLabels = {},
  navigateRows,
  enableRowSelection = false,
  rowSelection,
  onRowSelectionChange,
  getRowCanSelect,
  selectionActions,
}: CrmDataTableProps<TData, TValue>) {
  const router = useRouter();
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [internalRowSelection, setInternalRowSelection] =
    React.useState<RowSelectionState>({});

  const selectionState = rowSelection ?? internalRowSelection;
  const setSelectionState = onRowSelectionChange ?? setInternalRowSelection;

  /* TanStack Table returns unstable function refs; React Compiler skips memoization here. */
  // eslint-disable-next-line react-hooks/incompatible-library -- useReactTable
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    ...(enableRowSelection
      ? {
          enableRowSelection: (row: { original: TData }) =>
            getRowCanSelect ? getRowCanSelect(row.original) : true,
          getRowId: (row: TData) => row.id,
          onRowSelectionChange: setSelectionState,
        }
      : { enableRowSelection: false }),
    state: {
      columnFilters,
      columnVisibility,
      ...(enableRowSelection ? { rowSelection: selectionState } : {}),
    },
  });

  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const filterCol =
    filterColumnId != null ? table.getColumn(filterColumnId) : undefined;
  const selectedCount = enableRowSelection
    ? table.getFilteredSelectedRowModel().rows.length
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 py-1">
        <div className="flex flex-wrap items-center gap-2">
          {filterCol ? (
            <Input
              placeholder={filterPlaceholder}
              value={(filterCol.getFilterValue() as string) ?? ""}
              onChange={(event) => filterCol.setFilterValue(event.target.value)}
              className="max-w-sm"
            />
          ) : null}
          {enableRowSelection && selectedCount > 0 && selectionActions
            ? selectionActions
            : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">עמודות</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) =>
                    column.toggleVisibility(!!value)
                  }
                >
                  {columnLabels[column.id] ?? column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-hidden rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const href = navigateRows
                  ? rowHrefFromKind(navigateRows, row.original.id)
                  : undefined;
                return (
                  <TableRow
                    key={row.id}
                    data-state={
                      enableRowSelection && row.getIsSelected()
                        ? "selected"
                        : undefined
                    }
                    className={cn(href && "cursor-pointer hover:bg-muted/60")}
                    onClick={() => {
                      if (href) router.push(href);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={visibleColumnCount || columns.length}
                  className="h-24 text-center"
                >
                  אין תוצאות.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
