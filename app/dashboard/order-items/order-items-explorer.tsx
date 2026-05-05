"use client";

import { useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type {
  OrderItemStatusDb,
  OrderItemViewRow,
  PriorityDb,
} from "@/lib/db/types";
import { formatVolumeM3 } from "@/lib/db/format";
import { ChevronDown } from "lucide-react";
import { updateOrderItemStatus } from "@/app/dashboard/orders/actions";
import { ErrorDialog } from "@/components/error-dialog";

const PRI_RANK: Record<string, number> = {
  urgent: 0,
  medium: 1,
  low: 2,
};

function priorityLabel(p: string): string {
  if (p === "urgent") return "דחוף";
  if (p === "medium") return "בינוני";
  return "נמוך";
}

function worstPriorityAcrossOrders(
  orders: Map<
    string,
    {
      orderNumber: number;
      priority: string;
      supplyDue: string | null;
      rows: OrderItemViewRow[];
    }
  >
): PriorityDb | null {
  let best = Infinity;
  let chosen: PriorityDb | null = null;
  for (const o of orders.values()) {
    const r = PRI_RANK[o.priority] ?? 99;
    if (r < best) {
      best = r;
      chosen = o.priority as PriorityDb;
    }
  }
  return chosen;
}

function PriorityBadge({ p }: { p: PriorityDb }) {
  const variant =
    p === "urgent" ? "destructive" : p === "medium" ? "secondary" : "outline";
  return <Badge variant={variant}>{priorityLabel(p)}</Badge>;
}

function statusLabel(s: OrderItemStatusDb): string {
  switch (s) {
    case "pending":
      return "ממתין";
    case "in_progress":
      return "בייצור";
    case "completed":
      return "הושלם";
    default:
      return s;
  }
}

export function OrderItemsExplorer({
  emptyLabel = "אין פריטי הזמנה פתוחים.",
  items,
}: {
  emptyLabel?: string;
  items: OrderItemViewRow[];
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sorted = [...items].sort((a, b) => {
    const pr = PRI_RANK[a.order_priority] - PRI_RANK[b.order_priority];
    if (pr !== 0) return pr;
    const da = a.order_supply_due_date ?? "";
    const db = b.order_supply_due_date ?? "";
    return da.localeCompare(db);
  });

  const byCustomer = new Map<
    string,
    {
      name: string;
      orders: Map<
        string,
        {
          orderNumber: number;
          priority: string;
          supplyDue: string | null;
          rows: OrderItemViewRow[];
        }
      >;
    }
  >();

  for (const row of sorted) {
    let c = byCustomer.get(row.customer_id);
    if (!c) {
      c = { name: row.customer_name, orders: new Map() };
      byCustomer.set(row.customer_id, c);
    }
    let o = c.orders.get(row.order_id);
    if (!o) {
      o = {
        orderNumber: row.order_number,
        priority: row.order_priority,
        supplyDue: row.order_supply_due_date,
        rows: [],
      };
      c.orders.set(row.order_id, o);
    }
    o.rows.push(row);
  }

  return (
    <div className="flex flex-col gap-3 p-4 md:p-6">
      {[...byCustomer.entries()].map(([customerId, bundle]) => {
        const worstPri = worstPriorityAcrossOrders(bundle.orders);
        return (
          <Collapsible
            key={customerId}
            defaultOpen={false}
            className="group/collapsible rounded-lg border border-border bg-card"
          >
            <CollapsibleTrigger className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-start hover:bg-muted/40">
              <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-180" />
              <span className="font-semibold text-card-foreground">{bundle.name}</span>
              {worstPri ? <PriorityBadge p={worstPri} /> : null}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="flex flex-col gap-2 border-t border-border px-3 py-3">
                {[...bundle.orders.entries()].map(([orderId, ord]) => (
                  <Collapsible
                    key={orderId}
                    defaultOpen={false}
                    className="group/collapsible rounded-md border border-border bg-background"
                  >
                    <CollapsibleTrigger className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-start hover:bg-muted/40">
                      <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      <span className="text-sm font-medium">
                        הזמנה #{ord.orderNumber}
                      </span>
                      <PriorityBadge p={ord.priority as PriorityDb} />
                      <span className="text-muted-foreground text-xs">
                        {ord.supplyDue ? `יעד ${ord.supplyDue}` : ""}
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ul className="flex flex-col gap-2 border-t border-border px-3 py-3">
                        {ord.rows.map((ln) => (
                          <li
                            key={ln.id}
                            className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm md:flex-row md:flex-wrap md:items-center md:justify-between"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">{ln.stone_name}</p>
                              <p className="text-muted-foreground text-xs">
                                מידות {ln.length_m}×{ln.width_m}×{ln.height_m}{" "}
                                · כמות {ln.quantity} · נפח{" "}
                                {formatVolumeM3(Number(ln.volume_m3))} קו״ב
                              </p>
                            </div>
                            <div
                              className="shrink-0"
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <Select
                                dir="rtl"
                                value={ln.status}
                                onValueChange={async (v) => {
                                  const res = await updateOrderItemStatus(
                                    ln.id,
                                    v as OrderItemStatusDb
                                  );
                                  if (!res.ok) setErrorMessage(res.message);
                                  else window.location.reload();
                                }}
                              >
                                <SelectTrigger className="w-[min(100%,12rem)]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent dir="rtl">
                                  <SelectItem value="pending">
                                    {statusLabel("pending")}
                                  </SelectItem>
                                  <SelectItem value="in_progress">
                                    {statusLabel("in_progress")}
                                  </SelectItem>
                                  <SelectItem value="completed">
                                    {statusLabel("completed")}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
      {sorted.length === 0 ? (
        <p className="text-muted-foreground text-center text-sm py-12">
          {emptyLabel}
        </p>
      ) : null}
      <ErrorDialog
        message={errorMessage}
        onClose={() => setErrorMessage(null)}
      />
    </div>
  );
}
