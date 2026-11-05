"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type {
  ColumnDef,
  OnChangeFn,
  RowData,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, X } from "lucide-react";

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
import { formatDateShort } from "@/lib/db/format";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- חתימה מחייבת של TanStack
  interface ColumnMeta<TData extends RowData, TValue> {
    /**
     * טקסט נוסף לחיפוש הכללי בעמודה (למשל תווית עברית של סטטוס,
     * או ערך לעמודה בלי accessor). מצטרף לערך הגולמי של העמודה.
     */
    searchValue?: (row: TData) => string | number | null | undefined;
  }
}

/* ---------------------------------------------------------------------------
 * חיפוש כללי: כל העמודות הגלויות (מחרוזות / מספרים / מערכים), בלי תלות
 * בעמודה אחת. "1002" מוצא הזמנה #1002, "05.11.2026" מוצא תאריך 2026-11-05,
 * כמה מילים = כולן חייבות להופיע (בכל עמודה שהיא).
 * ------------------------------------------------------------------------- */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/[״”“]/g, '"')
    .replace(/[׳’‘]/g, "'")
    .replace(/[#₪,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pushSearchValue(out: string[], value: unknown) {
  if (value == null || value === "") return;
  if (Array.isArray(value)) {
    for (const v of value) pushSearchValue(out, v);
    return;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) out.push(String(value));
    return;
  }
  if (typeof value === "string") {
    out.push(value);
    if (ISO_DATE_RE.test(value)) out.push(formatDateShort(value));
    return;
  }
  if (typeof value === "boolean") return;
}

function readPath(row: unknown, path: string): unknown {
  let cur: unknown = row;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function columnIdOf<TData, TValue>(def: ColumnDef<TData, TValue>): string | undefined {
  if (def.id) return def.id;
  const key = (def as { accessorKey?: unknown }).accessorKey;
  return typeof key === "string" ? key.replace(/\./g, "_") : undefined;
}

function buildRowHaystack<TData, TValue>(
  row: TData,
  index: number,
  columns: ColumnDef<TData, TValue>[],
  visibility: VisibilityState,
  extraKeys: string[]
): string {
  const parts: string[] = [];
  for (const def of columns) {
    const id = columnIdOf(def);
    if (id && visibility[id] === false) continue;
    const accessorFn = (def as { accessorFn?: (r: TData, i: number) => unknown })
      .accessorFn;
    const accessorKey = (def as { accessorKey?: unknown }).accessorKey;
    if (accessorFn) pushSearchValue(parts, accessorFn(row, index));
    else if (typeof accessorKey === "string")
      pushSearchValue(parts, readPath(row, accessorKey));
    if (def.meta?.searchValue) pushSearchValue(parts, def.meta.searchValue(row));
  }
  for (const key of extraKeys) pushSearchValue(parts, readPath(row, key));
  return normalizeSearchText(parts.join(" \u0001 "));
}

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
  /**
   * @deprecated החיפוש עובר עכשיו על כל העמודות הגלויות — הפרופ נשאר
   * לתאימות לאחור ואין לו השפעה.
   */
  filterColumnId?: string;
  /** טקסט עזר בתיבת החיפוש, למשל "חיפוש לפי לקוח, מספר, ח.פ…" */
  filterPlaceholder?: string;
  /** שדות נוספים בשורה שנכללים בחיפוש גם בלי עמודה (למשל customer_tax_id) */
  searchKeys?: string[];
  /** עמודות מוסתרות כברירת מחדל ({ notes: false }) — ניתן להציג מ"עמודות" */
  initialColumnVisibility?: VisibilityState;
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
  filterPlaceholder = "חיפוש…",
  searchKeys,
  initialColumnVisibility,
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
  const [query, setQuery] = React.useState("");
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(() => initialColumnVisibility ?? {});
  const deferredQuery = React.useDeferredValue(query);

  const extraKeysSig = (searchKeys ?? []).join("|");
  const filteredData = React.useMemo(() => {
    const tokens = normalizeSearchText(deferredQuery)
      .split(" ")
      .filter(Boolean);
    if (tokens.length === 0) return data;
    const extraKeys = extraKeysSig ? extraKeysSig.split("|") : [];
    return data.filter((row, index) => {
      const hay = buildRowHaystack(row, index, columns, columnVisibility, extraKeys);
      return tokens.every((t) => hay.includes(t));
    });
  }, [data, columns, columnVisibility, deferredQuery, extraKeysSig]);
  const [internalRowSelection, setInternalRowSelection] =
    React.useState<RowSelectionState>({});

  const selectionState = rowSelection ?? internalRowSelection;
  const setSelectionState = onRowSelectionChange ?? setInternalRowSelection;

  /* TanStack Table returns unstable function refs; React Compiler skips memoization here. */
  // eslint-disable-next-line react-hooks/incompatible-library -- useReactTable
  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
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
      columnVisibility,
      ...(enableRowSelection ? { rowSelection: selectionState } : {}),
    },
  });

  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const selectedCount = enableRowSelection
    ? table.getSelectedRowModel().rows.length
    : 0;
  const shownCount = filteredData.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 py-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-sm sm:w-80">
            <Search
              className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              role="searchbox"
              aria-label="חיפוש בטבלה"
              placeholder={filterPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  setQuery("");
                }
              }}
              className="ps-8 pe-8 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute end-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="ניקוי החיפוש"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
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
                  {data.length === 0 ? "אין עדיין רשומות." : "אין תוצאות לחיפוש."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {data.length > 0 ? (
        <p className="text-muted-foreground text-xs tabular-nums">
          {shownCount === data.length
            ? `${data.length} רשומות`
            : `${shownCount} מתוך ${data.length} רשומות`}
          {truncatedAt && data.length >= truncatedAt
            ? ` · מוצגות ${truncatedAt} האחרונות בלבד`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
