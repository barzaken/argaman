"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { archiveStone, updateStone } from "../../actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { inventoryShipmentDescriptor } from "@/lib/db/inventory-taxonomy";
import {
  type InventoryFinishLevelDb,
  type InventoryPieceTypeDb,
  type InventoryStatusDb,
  type OrderStatusDb,
  type OrderViewRow,
} from "@/lib/db/types";
import { formatIls, normalizeHex } from "@/lib/db/format";
import { cn } from "@/lib/utils";

const inventoryStatusLabels: Record<InventoryStatusDb, string> = {
  available: "זמין",
  unavailable: "לא זמין",
  in_transit: "בדרך",
};

const orderStatusLabels: Record<OrderStatusDb, string> = {
  open: "פתוחה",
  in_production: "בייצור",
  ready_for_delivery: "מוכנה למשלוח",
  completed: "הושלמה",
  cancelled: "בוטלה",
};

export type StoneInventoryListRow = {
  id: string;
  quantity_available: number;
  quantity_total: number;
  quantity_reserved: number;
  status: InventoryStatusDb;
  finish_level: InventoryFinishLevelDb;
  piece_type: InventoryPieceTypeDb;
  volume_m3: number;
  length_m: number;
  width_m: number;
  height_m: number;
  created_at?: string;
};

function StoneRelatedTabs({
  inventoryRows,
  orderRows,
}: {
  inventoryRows: StoneInventoryListRow[];
  orderRows: OrderViewRow[];
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col px-2 pb-2 pt-4 md:px-4 lg:pb-4 lg:pt-6">
      <Tabs
        defaultValue="inventory"
        dir="rtl"
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        <TabsList className="grid w-full shrink-0 grid-cols-2">
          <TabsTrigger value="orders">הזמנות</TabsTrigger>
          <TabsTrigger value="inventory">מלאי</TabsTrigger>
        </TabsList>
        <TabsContent
          value="inventory"
          className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 outline-none"
        >
          <ul className="flex flex-col gap-2">
            {inventoryRows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/dashboard/inventory/${row.id}/edit`}
                  className="flex flex-col gap-1 rounded-lg border border-transparent bg-background p-3 text-start transition-colors hover:border-border hover:bg-muted/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      משלוח · נפח {row.volume_m3} קו״ב
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {inventoryStatusLabels[row.status]}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {inventoryShipmentDescriptor(
                      row.finish_level,
                      row.piece_type
                    )}{" "}
                    · מידות {row.length_m}×{row.width_m}×{row.height_m} מ׳ · סה״כ{" "}
                    {row.quantity_total} · זמין {row.quantity_available} ·
                    מוזמן {row.quantity_reserved}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {inventoryRows.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              אין פריטי מלאי לאבן זו
            </p>
          ) : null}
        </TabsContent>
        <TabsContent
          value="orders"
          className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 outline-none"
        >
          <ul className="flex flex-col gap-2">
            {orderRows.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/dashboard/orders/${o.id}`}
                  className="flex flex-col gap-1 rounded-lg border border-transparent bg-background p-3 text-start transition-colors hover:border-border hover:bg-muted/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium tabular-nums">
                      הזמנה #{o.order_number}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {orderStatusLabels[o.status]}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">{o.customer_name}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {formatIls(o.total)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {orderRows.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              אין הזמנות עם אבן זו
            </p>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-1 flex-col justify-center gap-5 px-4 py-6 md:px-8",
        className
      )}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function StoneEditForm({
  stone,
  inventoryRows,
  orderRows,
}: {
  stone: {
    id: string;
    name: string;
    color_hex: string;
  };
  inventoryRows: StoneInventoryListRow[];
  orderRows: OrderViewRow[];
}) {
  const router = useRouter();
  const [colorHex, setColorHex] = useState(stone.color_hex);
  const [stoneName, setStoneName] = useState(stone.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("id", stone.id);
    fd.set("name", stoneName);
    fd.set("color_hex", normalizeHex(colorHex));
    const res = await updateStone(fd);
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.push("/dashboard/stones");
    router.refresh();
  }

  async function handleArchive() {
    const res = await archiveStone(stone.id);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.push("/dashboard/stones");
    router.refresh();
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-background">
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col overflow-auto"
      >
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:items-stretch">
          <div className="flex min-h-0 w-full shrink-0 flex-col lg:w-[min(100%,26rem)] lg:border-e lg:border-border xl:w-[min(100%,28rem)]">
            <Section title="עריכת אבן" className="flex-none justify-start py-6">
              <div className="flex w-full flex-col gap-5 sm:flex-row sm:items-end">
                <div className="flex shrink-0 flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">צבע</span>
                  <input
                    type="color"
                    value={normalizeHex(colorHex).slice(0, 7)}
                    onChange={(e) => setColorHex(e.target.value)}
                    className="size-14 cursor-pointer overflow-hidden rounded-xl border border-border bg-background p-1 shadow-sm [&::-moz-color-swatch]:rounded-lg [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-0"
                    aria-label="בחירת צבע"
                  />
                </div>
                <Field label="שם האבן" className="min-w-0 flex-1">
                  <Input
                    value={stoneName}
                    onChange={(e) => setStoneName(e.target.value)}
                    required
                  />
                </Field>
              </div>

              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
            </Section>
          </div>

          <div className="flex min-h-[min(40vh,24rem)] flex-1 flex-col border-t border-border lg:min-h-0 lg:border-t-0">
            <StoneRelatedTabs
              inventoryRows={inventoryRows}
              orderRows={orderRows}
            />
          </div>
        </div>

        <div className="sticky bottom-0 z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-8">
          <Button
            type="button"
            variant="destructive"
            onClick={() => setArchiveDialogOpen(true)}
          >
            ארכיון
          </Button>
          <ConfirmDialog
            open={archiveDialogOpen}
            onOpenChange={setArchiveDialogOpen}
            title="ארכיון אבן"
            description="להפסיק להציג את האבן בקטלוג?"
            confirmLabel="ארכיון"
            confirmVariant="destructive"
            onConfirm={() => void handleArchive()}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/dashboard/stones")}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "שומר…" : "שמירה"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
