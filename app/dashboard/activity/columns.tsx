"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { crmRoleShortLabel } from "@/components/role-context";
import { Badge } from "@/components/ui/badge";
import { activityActionLabels } from "@/lib/db/labels";

import type { ActivityDisplayRow } from "./activity-format";

export const activityColumnLabels: Record<string, string> = {
  at: "זמן",
  user_email: "משתמש",
  action: "פעולה",
  entity: "רשומה",
  changes: "שינויים",
};

function actionVariant(a: ActivityDisplayRow["action"]) {
  if (a === "delete") return "destructive" as const;
  if (a === "insert") return "secondary" as const;
  return "outline" as const;
}

export const activityColumns: ColumnDef<ActivityDisplayRow>[] = [
  {
    accessorKey: "at",
    header: "זמן",
    meta: { searchValue: (r) => r.at_display },
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums text-sm">
        {row.original.at_display}
      </span>
    ),
  },
  {
    accessorKey: "user_email",
    header: "משתמש",
    meta: { searchValue: (r) => crmRoleShortLabel(r.user_role) },
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5">
        <span dir="ltr" className="text-start text-sm">
          {row.original.user_email ?? "מערכת"}
        </span>
        {row.original.user_role ? (
          <span
            className={
              row.original.user_role === "agent"
                ? "text-xs text-amber-700 dark:text-amber-400"
                : "text-xs text-muted-foreground"
            }
          >
            {crmRoleShortLabel(row.original.user_role)}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "action",
    header: "פעולה",
    meta: { searchValue: (r) => activityActionLabels[r.action] },
    cell: ({ row }) => (
      <Badge variant={actionVariant(row.original.action)}>
        {activityActionLabels[row.original.action]}
      </Badge>
    ),
  },
  {
    id: "entity",
    accessorFn: (r) => `${r.table_label} ${r.entity_label}`,
    header: "רשומה",
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs">{r.table_label}</span>
          {r.href ? (
            <Link
              href={r.href}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {r.entity_label}
            </Link>
          ) : (
            <span className="text-sm font-medium">{r.entity_label}</span>
          )}
        </div>
      );
    },
  },
  {
    id: "changes",
    accessorFn: (r) =>
      r.changes
        .map((c) => `${c.label} ${c.old ?? ""} ${c.value}`)
        .join(" "),
    header: "שינויים",
    enableSorting: false,
    cell: ({ row }) => {
      const r = row.original;
      if (r.changes.length === 0) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <ul className="flex max-w-[34rem] flex-col gap-0.5 text-xs">
          {r.changes.map((c) => (
            <li key={c.column} className="leading-relaxed">
              <span className="text-muted-foreground">{c.label}: </span>
              {r.action === "update" ? (
                <>
                  <span className="text-muted-foreground line-through decoration-muted-foreground/50">
                    {c.old}
                  </span>
                  <span className="text-muted-foreground"> ← </span>
                  <span className="font-medium text-foreground">{c.value}</span>
                </>
              ) : (
                <span className="text-foreground">{c.value}</span>
              )}
            </li>
          ))}
        </ul>
      );
    },
  },
];
