"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { CrmDataTable } from "@/components/crm/data-table";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { documentKindGroups, documentKindLabels } from "@/lib/db/labels";
import type { DocumentViewRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";

import { documentsColumnLabels, documentsColumns } from "./columns";

export type StatusFilter = "all" | "pending_review" | "processed" | "rejected";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "pending_review", label: "ממתינים לבדיקה" },
  { value: "processed", label: "טופלו" },
  { value: "rejected", label: "נדחו" },
];

export function DocumentsTable({
  rows,
  status,
  kind,
  pendingCount,
  truncatedAt,
}: {
  rows: DocumentViewRow[];
  status: StatusFilter;
  kind: string;
  pendingCount: number;
  truncatedAt: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setParam(key: string, value: string | null) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    const qs = sp.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={status}
          onValueChange={(v) => setParam("status", v === "all" ? null : v)}
          dir="rtl"
        >
          <TabsList aria-label="סינון לפי סטטוס">
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {t.value === "pending_review" && pendingCount > 0 ? (
                  <span className="tabular-nums text-muted-foreground"> ({pendingCount})</span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Select
          value={kind || "all"}
          onValueChange={(v) => setParam("kind", v === "all" ? null : v)}
        >
          <SelectTrigger className="w-64" aria-label="סינון לפי סוג מסמך">
            <SelectValue placeholder="כל הסוגים" />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value="all">כל הסוגים</SelectItem>
            {documentKindGroups.map((g) => (
              <SelectGroup key={g.label}>
                <SelectLabel>{g.label}</SelectLabel>
                {g.kinds.map((k) => (
                  <SelectItem key={k} value={k}>
                    {documentKindLabels[k]}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* שורה בטבלה פותחת את המסמך (דרך data-row-href בתא הפעולות) */}
      <div
        className={cn(
          "[&_tbody_tr:has([data-row-href])]:cursor-pointer [&_tbody_tr:has([data-row-href]):hover]:bg-muted/60",
          isPending && "opacity-60 transition-opacity"
        )}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("a,button,input,[role=menuitem]")) return;
          if (window.getSelection()?.toString()) return;
          const tr = target.closest("tbody tr");
          const href = tr?.querySelector<HTMLElement>("[data-row-href]")?.dataset.rowHref;
          if (href) router.push(href);
        }}
      >
        <CrmDataTable
          columns={documentsColumns}
          data={rows}
          filterColumnId="counterparty_name"
          filterPlaceholder="סנן לפי צד שני / ח.פ..."
          columnLabels={documentsColumnLabels}
          truncatedAt={truncatedAt}
        />
      </div>
    </div>
  );
}
