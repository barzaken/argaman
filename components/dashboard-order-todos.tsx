"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type {
  OrderItemStatusDb,
  OrderItemViewRow,
  PriorityDb,
} from "@/lib/db/types";
import { ChevronDown } from "lucide-react";

const orderItemStatusLabels: Record<OrderItemStatusDb, string> = {
  pending: "ממתין",
  in_progress: "בייצור",
  completed: "הושלם",
  cancelled: "בוטל",
};

const priorityLabels: Record<PriorityDb, string> = {
  low: "נמוך",
  medium: "בינוני",
  urgent: "דחוף",
};

const PRI_RANK: Record<PriorityDb, number> = {
  urgent: 0,
  medium: 1,
  low: 2,
};

function priorityDotClass(priority: PriorityDb): string {
  switch (priority) {
    case "urgent":
      return "bg-destructive";
    case "medium":
      return "bg-amber-500 dark:bg-amber-400";
    case "low":
      return "bg-muted-foreground";
  }
}

function worstPriority(rows: OrderItemViewRow[]): PriorityDb | null {
  let best = Infinity;
  let chosen: PriorityDb | null = null;
  for (const r of rows) {
    const rank = PRI_RANK[r.order_priority] ?? 99;
    if (rank < best) {
      best = rank;
      chosen = r.order_priority;
    }
  }
  return chosen;
}

function sortItems(a: OrderItemViewRow, b: OrderItemViewRow): number {
  const pr = PRI_RANK[a.order_priority] - PRI_RANK[b.order_priority];
  if (pr !== 0) return pr;
  const da = a.order_supply_due_date ?? "";
  const db = b.order_supply_due_date ?? "";
  if (da !== db) return da.localeCompare(db);
  return a.order_number - b.order_number;
}

export function DashboardOrderTodos({ items }: { items: OrderItemViewRow[] }) {
  const byCustomer = new Map<
    string,
    { name: string; rows: OrderItemViewRow[] }
  >();

  for (const it of items) {
    let g = byCustomer.get(it.customer_id);
    if (!g) {
      g = { name: it.customer_name, rows: [] };
      byCustomer.set(it.customer_id, g);
    }
    g.rows.push(it);
  }

  const groups = [...byCustomer.entries()].map(([id, g]) => ({
    id,
    name: g.name,
    rows: [...g.rows].sort(sortItems),
  }));

  groups.sort((a, b) => {
    const pa = worstPriority(a.rows);
    const pb = worstPriority(b.rows);
    const ra = pa != null ? PRI_RANK[pa] : 99;
    const rb = pb != null ? PRI_RANK[pb] : 99;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, "he");
  });

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-center text-sm">
        אין פריטים פתוחים
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {groups.map((g) => {
        const pri = worstPriority(g.rows);
        return (
          <Collapsible
            key={g.id}
            defaultOpen={false}
            className="group/collapsible rounded-lg border border-border bg-card"
          >
            <CollapsibleTrigger className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-start hover:bg-muted/40">
              <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-180" />
              <span className="min-w-0 flex-1 font-medium text-card-foreground">
                {g.name}
              </span>
              {pri ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${priorityDotClass(pri)}`}
                    aria-hidden
                  />
                  <span>{priorityLabels[pri]}</span>
                </span>
              ) : null}
              <Badge variant="secondary" className="shrink-0">
                {g.rows.length}
              </Badge>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="flex flex-col gap-2 border-t border-border px-3 py-3">
                {g.rows.map((it) => (
                  <li key={it.id}>
                    <Link
                      href={`/dashboard/orders/${it.order_id}`}
                      className="flex flex-col gap-1 rounded-lg border border-border bg-background p-3 text-start transition-colors hover:bg-muted/40"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-card-foreground">
                          {it.stone_name}
                        </span>
                        <Badge variant="outline" className="shrink-0">
                          #{it.order_number}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        סטטוס: {orderItemStatusLabels[it.status]} · תעדוף הזמנה:
                        {" "}
                        <span className="inline-flex items-center gap-1.5 align-middle">
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${priorityDotClass(it.order_priority)}`}
                            aria-hidden
                          />
                          <span>{priorityLabels[it.order_priority]}</span>
                        </span>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
