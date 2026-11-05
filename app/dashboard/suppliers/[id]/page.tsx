import type { LucideIcon } from "lucide-react";
import { ArrowRight, Hash, Mail, MapPin, Phone, Plus, StickyNote } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ExpensesPanel } from "@/components/expenses/expenses-panel";
import { sumBy } from "@/components/expenses/expense-utils";
import { KpiCard } from "@/components/kpi-card";
import { SupplierActions } from "@/components/suppliers/supplier-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCrmUser } from "@/lib/supabase/auth-helpers";
import {
  formatDateShort,
  formatDimensionsCmFromMeters,
  formatIls,
} from "@/lib/db/format";
import type { InventoryItemViewRow, SupplierRow } from "@/lib/db/types";
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
  return (
    <div className="flex gap-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p
          className={cn(
            "mt-0.5 font-medium text-foreground whitespace-pre-line",
            mono && "tabular-nums tracking-tight",
            !value && "text-muted-foreground font-normal"
          )}
          dir={mono && value ? "ltr" : undefined}
        >
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

const inventoryStatusLabels: Record<InventoryItemViewRow["status"], string> = {
  available: "זמין",
  unavailable: "לא זמין",
  in_transit: "בדרך",
};

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !supplier) notFound();
  const s = supplier as SupplierRow;

  const [{ data: expenses }, { data: inventory }, me] = await Promise.all([
    supabase
      .from("expenses")
      .select("amount_total, is_paid")
      .eq("supplier_id", id)
      .limit(5000),
    supabase
      .from("inventory_items_view")
      .select("*")
      .eq("supplier_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    getCurrentCrmUser(),
  ]);

  const expenseRows = (expenses ?? []) as { amount_total: number; is_paid: boolean }[];
  const inventoryRows = (inventory ?? []) as InventoryItemViewRow[];

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="border-b border-border px-4 py-2">
        <Link
          href="/dashboard/suppliers"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowRight className="size-3.5 shrink-0 opacity-70" aria-hidden />
          כל הספקים
        </Link>
      </div>

      <div className="grid border-b border-border grid-cols-2 xl:grid-cols-4">
        <KpiCard label="הוצאות" value={expenseRows.length} icon="clipboard-check" />
        <KpiCard
          label="סך הוצאות"
          value={Math.round(sumBy(expenseRows, (e) => e.amount_total))}
          icon="circle-dollar-sign"
          valueType="currency"
        />
        <KpiCard
          label="לא שולם"
          value={Math.round(
            sumBy(
              expenseRows.filter((e) => !e.is_paid),
              (e) => e.amount_total
            )
          )}
          icon="file-warning"
          valueType="currency"
        />
        <KpiCard label="משלוחי מלאי מהספק" value={inventoryRows.length} icon="warehouse" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:flex-row lg:overflow-hidden">
        <div className="flex min-h-0 flex-[3] flex-col border-border lg:overflow-auto lg:border-l">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-foreground">{s.name}</h1>
                {!s.is_active ? (
                  <Badge variant="secondary" className="font-normal">
                    בארכיון
                  </Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground text-xs">פרטי ספק</p>
            </div>
            <SupplierActions
              id={s.id}
              name={s.name}
              isActive={s.is_active}
              isAdmin={Boolean(me?.isAdmin)}
            />
          </div>

          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <DetailRow icon={Hash} label="ח.פ / ע.מ" value={s.tax_id} mono />
            <DetailRow icon={Phone} label="טלפון" value={s.phone} mono />
            <DetailRow icon={Mail} label="דוא״ל" value={s.email} />
            <DetailRow icon={MapPin} label="כתובת" value={s.address} />
            <DetailRow icon={StickyNote} label="הערות" value={s.notes} />
            {s.green_invoice_supplier_id ? (
              <DetailRow
                icon={Hash}
                label="מזהה ספק ב-Green Invoice"
                value={s.green_invoice_supplier_id}
                mono
              />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">משלוחי מלאי מהספק</h2>
              <p className="text-muted-foreground text-xs">עד 50 משלוחים אחרונים</p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href={`/dashboard/inventory/new?supplier=${s.id}`}>
                <Plus className="size-3.5" aria-hidden />
                קליטת מלאי מהספק
              </Link>
            </Button>
          </div>
          <ul className="flex flex-col gap-3 p-4">
            {inventoryRows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dashboard/inventory/${r.id}/edit`}
                  className={cn(linkRowClass, "px-3 py-3")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <span
                        className="size-3 shrink-0 rounded-full border border-black/10"
                        style={{ backgroundColor: r.color_hex }}
                        aria-hidden
                      />
                      {r.stone_name}
                    </span>
                    <Badge variant="outline" className="font-normal">
                      {inventoryStatusLabels[r.status]}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                    {formatDimensionsCmFromMeters(r.length_m, r.width_m, r.height_m)} ס״מ ·{" "}
                    {r.quantity_total} יח׳ · {formatIls(Number(r.price_per_m3))} לקו״ב
                    {r.created_at ? ` · נקלט ${formatDateShort(r.created_at)}` : ""}
                  </p>
                </Link>
              </li>
            ))}
            {inventoryRows.length === 0 ? (
              <li className="text-muted-foreground py-8 text-center text-sm">
                אין משלוחי מלאי מספק זה
              </li>
            ) : null}
          </ul>
        </div>

        <div className="flex min-h-0 flex-[2] flex-col lg:overflow-auto">
          <ExpensesPanel supplierId={s.id} />
        </div>
      </div>
    </div>
  );
}
