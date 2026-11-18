import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StageBadge } from "@/components/memorials/ui";
import { createClient } from "@/lib/supabase/server";
import { toHebrewError } from "@/lib/db/errors";
import { formatDateShort, formatIls } from "@/lib/db/format";
import {
  MEM_ORDER_KIND_LABELS,
  MEM_PIPELINE_STAGES,
  MEM_STAGE_LABELS,
  type MemOrderKind,
  type MemStage,
} from "@/lib/memorials/constants";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  number: number;
  stage: MemStage;
  kind: MemOrderKind;
  customer_name: string;
  deceased_name: string | null;
  cemetery: string | null;
  price: number | null;
  installation_date: string | null;
  updated_at: string;
};

export default async function MemorialOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ closed?: string }>;
}) {
  const { closed } = await searchParams;
  const showClosed = closed === "1";
  const supabase = await createClient();
  let q = supabase
    .from("mem_orders")
    .select("id, number, stage, kind, customer_name, deceased_name, cemetery, price, installation_date, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1000);
  q = showClosed ? q.in("stage", ["done", "cancelled"]) : q.not("stage", "in", "(done,cancelled)");
  const { data, error } = await q;
  const rows = (data ?? []) as Row[];

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 md:px-6">
        <p className="text-muted-foreground text-sm">
          {showClosed ? "הזמנות שהושלמו או בוטלו" : "לוח הזמנות פרטיות לפי שלב"}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href={showClosed ? "/dashboard/memorials/orders" : "/dashboard/memorials/orders?closed=1"}>
              {showClosed ? "הזמנות פתוחות" : "הושלמו / בוטלו"}
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/dashboard/memorials/orders/new">הזמנה חדשה</Link>
          </Button>
        </div>
      </div>
      {error ? <p className="text-destructive p-4 text-sm">{toHebrewError(error, "טעינת ההזמנות נכשלה")}</p> : null}
      {showClosed ? (
        <div className="overflow-auto p-4 md:p-6">
          <ul className="mx-auto flex max-w-4xl flex-col divide-y divide-border rounded-xl border border-border">
            {rows.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <Link href={`/dashboard/memorials/orders/${o.id}`} className="font-medium hover:underline">
                  #{o.number} · {o.customer_name}
                  {o.deceased_name ? ` (${o.deceased_name})` : ""}
                </Link>
                <span className="flex items-center gap-2">
                  <StageBadge stage={o.stage} />
                  <span className="text-muted-foreground text-xs">{formatDateShort(o.updated_at)}</span>
                </span>
              </li>
            ))}
            {!rows.length ? <li className="text-muted-foreground p-3 text-sm">אין הזמנות.</li> : null}
          </ul>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3 md:p-4">
          {MEM_PIPELINE_STAGES.map((stage) => {
            const list = rows.filter((r) => r.stage === stage);
            return (
              <section key={stage} className="flex w-64 shrink-0 flex-col rounded-xl border border-border bg-muted/30">
                <header className="flex items-center justify-between border-b border-border px-3 py-2">
                  <h2 className="text-sm font-semibold">{MEM_STAGE_LABELS[stage]}</h2>
                  <span className="text-muted-foreground text-xs tabular-nums">{list.length}</span>
                </header>
                <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                  {list.map((o) => (
                    <li key={o.id}>
                      <Link
                        href={`/dashboard/memorials/orders/${o.id}`}
                        className={cn("block rounded-lg border border-border bg-card p-2.5 text-sm transition-colors hover:bg-accent")}
                      >
                        <p className="font-medium">
                          #{o.number} · {o.customer_name}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {MEM_ORDER_KIND_LABELS[o.kind]}
                          {o.deceased_name ? ` · ${o.deceased_name}` : ""}
                          {o.cemetery ? ` · ${o.cemetery}` : ""}
                        </p>
                        <p className="text-muted-foreground mt-1 flex justify-between text-xs">
                          <span>{o.price ? formatIls(Number(o.price)) : "ללא מחיר"}</span>
                          {o.installation_date ? <span>התקנה {formatDateShort(o.installation_date)}</span> : null}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
