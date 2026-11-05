"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type {
  ColumnDef,
  ColumnFiltersState,
  OnChangeFn,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

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
  | "quote-detail"
  | "delivery-detail"
  | "customer-detail";

function rowHrefFromKind(kind: CrmRowNavigateKind, id: string): string {
  switch (kind) {
    case "inventory-edit":
      return `/dashboard/inventory/${id}/edit`;
    case "order-detail":
      return `/dashboard/orders/${id}`;
    case "quote-detail":
      return `/dashboard/quotes/${id}`;
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
  /** אם השאילתה מוגבלת (למשל 400 אחרונות) — מציגים הערה כשמגיעים לתקרה */
  truncatedAt?: number;
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
  truncatedAt,
}: CrmDataTableProps<TData, TValue>) {
  const router = useRouter();
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [sorting, setSorting] = React.useState<SortingState>([]);
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
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
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
      sorting,
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
        <Table dir="rtl">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const content = header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      );
                  const canSort = !header.isPlaceholder && header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : undefined
                      }
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="group/sort -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {content}
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3.5 shrink-0" aria-hidden />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3.5 shrink-0" aria-hidden />
                          ) : (
                            <ChevronsUpDown
                              className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/sort:opacity-50 group-focus-visible/sort:opacity-50"
                              aria-hidden
                            />
                          )}
                        </button>
                      ) : (
                        content
                      )}
                    </TableHead>
                  );
                })}
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
                    className={cn(
                      href &&
                        "cursor-pointer transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                    )}
                    tabIndex={href ? 0 : undefined}
                    onMouseEnter={href ? () => router.prefetch(href) : undefined}
                    onClick={(e) => {
                      if (!href) return;
                      // לא לנווט אם המשתמש סימן טקסט להעתקה
                      if (window.getSelection()?.toString()) return;
                      if (e.metaKey || e.ctrlKey) {
                        window.open(href, "_blank", "noopener");
                        return;
                      }
                      router.push(href);
                    }}
                    onAuxClick={(e) => {
                      if (href && e.button === 1) {
                        window.open(href, "_blank", "noopener");
                      }
                    }}
                    onKeyDown={(e) => {
                      if (href && e.key === "Enter" && e.target === e.currentTarget) {
                        router.push(href);
                      }
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
                  className="h-24 text-center text-muted-foreground"
                >
                  {data.length === 0 ? "אין עדיין רשומות." : "אין תוצאות לסינון."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {data.length > 0 ? (
        <p className="text-muted-foreground text-xs tabular-nums">
          {table.getFilteredRowModel().rows.length === data.length
            ? `${data.length} רשומות`
            : `${table.getFilteredRowModel().rows.length} מתוך ${data.length} רשומות`}
          {truncatedAt && data.length >= truncatedAt
            ? ` · מוצגות ${truncatedAt} האחרונות בלבד`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
