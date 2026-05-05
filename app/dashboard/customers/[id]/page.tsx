import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Hash,
  Mail,
  MapPin,
  Pencil,
  Phone,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerPriceOverrides } from "./customer-price-overrides";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/kpi-card";
import { createClient } from "@/lib/supabase/server";
import type { CustomerStonePriceRow } from "@/lib/db/types";
import type { CustomerRow } from "@/lib/db/types";
import type { StoneRow } from "@/lib/db/types";
import { formatIls } from "@/lib/db/format";
import { cn } from "@/lib/utils";

const linkRowClass =
  "block rounded-lg border border-border bg-card shadow-sm transition-colors hover:bg-muted/30 hover:border-muted-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function DetailRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm">
      <Icon
        className="mt-0.5 size-4 shrink-0 text-zinc-300 dark:text-zinc-600"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p
          className={cn(
            "mt-0.5 font-medium text-foreground",
            mono && "tabular-nums tracking-tight"
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !customer) notFound();

  const c = customer as CustomerRow;

  const { data: prices } = await supabase
    .from("customer_stone_prices")
    .select("*")
    .eq("customer_id", id);

  const { data: stoneRows } = await supabase
    .from("stones")
    .select("id, name, polish_type")
    .eq("is_active", true)
    .order("name");

  const stoneMap = new Map<
    string,
    Pick<StoneRow, "id" | "name" | "polish_type">
  >();
  for (const row of stoneRows ?? []) {
    stoneMap.set(row.id as string, row as Pick<StoneRow, "id" | "name" | "polish_type">);
  }

  const overrides = (prices ?? []).map((p) => {
    const pr = p as CustomerStonePriceRow;
    const st = stoneMap.get(pr.stone_id);
    const label = st ? `${st.name} · ${st.polish_type}` : pr.stone_id;
    return { ...pr, label };
  });

  const { data: orders } = await supabase
    .from("orders_view")
    .select("*")
    .eq("customer_id", id)
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: deliveries } = await supabase
    .from("deliveries_view")
    .select("*")
    .eq("customer_id", id)
    .order("created_at", { ascending: false })
    .limit(30);

  const orderList = orders ?? [];
  const deliveryList = deliveries ?? [];

  const unpaidTotal = Math.round(
    deliveryList
      .filter((d) => d.payment_status === "unpaid")
      .reduce((s, d) => s + Number(d.total), 0)
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="border-b border-border px-4 py-2">
        <Link
          href="/dashboard/customers"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowRight className="size-3.5 shrink-0 opacity-70" aria-hidden />
          כל הלקוחות
        </Link>
      </div>

      <div className="grid border-b border-border sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="הזמנות"
          value={orderList.length}
          icon="package"
        />
        <KpiCard
          label="תעודות משלוח"
          value={deliveryList.length}
          icon="truck"
        />
        <KpiCard
          label="מחירי קטלוג ללקוח"
          value={overrides.length}
          icon="warehouse"
        />
        <KpiCard
          label="יתרה לגבייה (לא שולם)"
          value={unpaidTotal}
          icon="file-warning"
          valueType="currency"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-[3] flex-col overflow-auto border-border lg:border-l">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{c.name}</h2>
              <p className="text-muted-foreground text-xs">
                פרטי קשר ומחירים לפי קטלוג
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!c.is_active ? (
                <Badge variant="secondary" className="font-normal">
                  לא פעיל
                </Badge>
              ) : null}
              <Button variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
                <Link href={`/dashboard/customers/${id}/edit`}>
                  <Pencil className="size-3.5" aria-hidden />
                  עריכה
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4 p-4">
            <DetailRow icon={Hash} label="ח.פ / ת״ז" value={c.tax_id} mono />
            <DetailRow icon={Mail} label="אימייל" value={c.email} />
            <DetailRow icon={Phone} label="טלפון" value={c.phone} mono />
            <DetailRow icon={MapPin} label="כתובת" value={c.address} />
          </div>

          <div className="border-y border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              מחירי קטלוג ללקוח
            </h2>
            <p className="text-muted-foreground text-xs">
              מחיר קו״ב ללקוח לפי אבן — חל על כל המשלוחים מאותו מוצר
            </p>
          </div>

          <CustomerPriceOverrides
            customerId={id}
            overrides={overrides}
            stoneOptions={
              (stoneRows ?? []) as Pick<
                StoneRow,
                "id" | "name" | "polish_type"
              >[]
            }
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              הזמנות אחרונות
            </h2>
            <p className="text-muted-foreground text-xs">עד 30 הזמנות</p>
          </div>
          <ul className="flex flex-col gap-3 p-4">
            {orderList.map((o) => (
              <li key={o.id as string}>
                <Link
                  href={`/dashboard/orders/${o.id}`}
                  className={cn(linkRowClass, "px-3 py-3")}
                >
                  <span className="text-sm font-semibold text-foreground">
                    הזמנה #{o.order_number as number}
                  </span>
                  <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                    {formatIls(Number(o.total))}
                  </p>
                </Link>
              </li>
            ))}
            {orderList.length === 0 ? (
              <li className="text-muted-foreground py-8 text-center text-sm">
                אין הזמנות להצגה
              </li>
            ) : null}
          </ul>

          <div className="border-y border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              תעודות משלוח
            </h2>
            <p className="text-muted-foreground text-xs">עד 30 תעודות</p>
          </div>
          <ul className="flex flex-col gap-3 p-4">
            {deliveryList.map((d) => (
              <li key={d.id as string}>
                <Link
                  href={`/dashboard/deliveries/${d.id}`}
                  className={cn(linkRowClass, "px-3 py-3")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      משלוח #{d.delivery_number as number}
                    </span>
                    <Badge
                      variant={
                        d.payment_status === "paid" ? "secondary" : "outline"
                      }
                      className="font-normal"
                    >
                      {d.payment_status === "paid" ? "שולם" : "לא שולם"}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                    {formatIls(Number(d.total))}
                  </p>
                </Link>
              </li>
            ))}
            {deliveryList.length === 0 ? (
              <li className="text-muted-foreground py-8 text-center text-sm">
                אין משלוחים להצגה
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
