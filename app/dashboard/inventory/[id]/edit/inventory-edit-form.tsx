"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { updateInventoryItem } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type {
  InventoryItemViewRow,
  OrderItemViewRow,
  OrderStatusDb,
  StoneRow,
} from "@/lib/db/types";
import { formatIls } from "@/lib/db/format";
import {
  computeVolumeM3FromCm,
  metersToCmInput,
} from "@/lib/db/calculations";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "available", label: "זמין" },
  { value: "unavailable", label: "לא זמין" },
  { value: "in_transit", label: "בדרך" },
];

const orderStatusLabels: Record<OrderStatusDb, string> = {
  open: "פתוחה",
  in_production: "בייצור",
  ready_for_delivery: "מוכנה למשלוח",
  completed: "הושלמה",
  cancelled: "בוטלה",
};

function InventoryOrdersPanel({
  deliveryQuantityTotal,
  orderItemRows,
}: {
  deliveryQuantityTotal: number;
  orderItemRows: OrderItemViewRow[];
}) {
  const ordersAggregated = useMemo(() => {
    const map = new Map<
      string,
      {
        orderId: string;
        orderNumber: number;
        status: OrderStatusDb;
        customerName: string;
        qtyFromShipment: number;
        linesSubtotal: number;
      }
    >();
    for (const oi of orderItemRows) {
      const cur = map.get(oi.order_id);
      if (cur) {
        cur.qtyFromShipment += oi.quantity;
        cur.linesSubtotal += oi.line_subtotal;
      } else {
        map.set(oi.order_id, {
          orderId: oi.order_id,
          orderNumber: oi.order_number,
          status: oi.order_status,
          customerName: oi.customer_name,
          qtyFromShipment: oi.quantity,
          linesSubtotal: oi.line_subtotal,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.orderNumber - a.orderNumber);
  }, [orderItemRows]);

  const denom =
    deliveryQuantityTotal > 0 ? deliveryQuantityTotal : 0;

  return (
    <div
      dir="rtl"
      className="flex h-full min-h-0 flex-1 flex-col px-2 pb-2 pt-4 md:px-4 lg:pb-4 lg:pt-6"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="inline-flex h-9 w-fit shrink-0 items-center rounded-lg bg-muted p-1 text-muted-foreground">
          <span className="inline-flex items-center justify-center rounded-md bg-background px-3 py-1 text-sm font-medium text-foreground shadow-sm ring-1 ring-border/50">
            הזמנות
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-muted/30 p-2">
          <ul className="flex flex-col gap-2">
            {ordersAggregated.map((o) => {
              const pct =
                denom > 0
                  ? Math.min(100, Math.round((o.qtyFromShipment / denom) * 100))
                  : 0;
              return (
                <li key={o.orderId}>
                  <Link
                    href={`/dashboard/orders/${o.orderId}`}
                    className="flex flex-col gap-2 rounded-lg border border-transparent bg-background p-3 text-start transition-colors hover:border-border hover:bg-muted/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium tabular-nums">
                        הזמנה #{o.orderNumber}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {orderStatusLabels[o.status]}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {o.customerName}
                    </p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {formatIls(o.linesSubtotal)}
                    </p>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs tabular-nums text-muted-foreground">
                        <span>
                          מהמשלוח: {o.qtyFromShipment} / {denom || "—"}
                        </span>
                        {denom > 0 ? <span>{pct}%</span> : null}
                      </div>
                      {denom > 0 ? (
                        <div
                          className="h-2 w-full overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div
                            className="h-full bg-primary transition-[width]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {ordersAggregated.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              אין הזמנות המקושרות למשלוח זה
            </p>
          ) : null}
        </div>
      </div>
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

export function InventoryEditForm({
  row,
  stones,
  orderItemRows,
}: {
  row: InventoryItemViewRow;
  stones: StoneRow[];
  orderItemRows: OrderItemViewRow[];
}) {
  const router = useRouter();
  const stone = stones.find((s) => s.id === row.stone_id);
  const [lengthCm, setLengthCm] = useState(metersToCmInput(Number(row.length_m)));
  const [widthCm, setWidthCm] = useState(metersToCmInput(Number(row.width_m)));
  const [heightCm, setHeightCm] = useState(metersToCmInput(Number(row.height_m)));
  const [quantity, setQuantity] = useState(String(row.quantity_total));
  const [pricePerM3, setPricePerM3] = useState(String(row.price_per_m3));
  const [customerPrice, setCustomerPrice] = useState(String(row.customer_price));
  const [status, setStatus] = useState(row.status);
  const [expectedDate, setExpectedDate] = useState(
    row.expected_arrival_date ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const volumePreview = useMemo(() => {
    const L = parseFloat(lengthCm.replace(",", ".")) || 0;
    const W = parseFloat(widthCm.replace(",", ".")) || 0;
    const H = parseFloat(heightCm.replace(",", ".")) || 0;
    const Q = parseInt(quantity.replace(",", "."), 10) || 0;
    if (!L || !W || !H || !Q) return null;
    return computeVolumeM3FromCm({
      lengthCm: L,
      widthCm: W,
      heightCm: H,
      quantity: Q,
    });
  }, [lengthCm, widthCm, heightCm, quantity]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("stone_id", row.stone_id);
    const L = parseFloat(lengthCm.replace(",", ".")) || 0;
    const W = parseFloat(widthCm.replace(",", ".")) || 0;
    const H = parseFloat(heightCm.replace(",", ".")) || 0;
    fd.set("length_m", String(L / 100));
    fd.set("width_m", String(W / 100));
    fd.set("height_m", String(H / 100));
    fd.set("quantity_total", quantity);
    fd.set("price_per_m3", pricePerM3.replace(",", "."));
    fd.set("customer_price", customerPrice.replace(",", "."));
    fd.set("status", status);
    if (status === "in_transit") fd.set("expected_arrival_date", expectedDate);
    else fd.set("expected_arrival_date", "");
    const res = await updateInventoryItem(fd);
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.push("/dashboard/inventory");
    router.refresh();
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-background">
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col overflow-auto"
      >
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:items-stretch">
          <div className="flex min-h-0 w-full flex-col lg:w-[min(100%,26rem)] lg:shrink-0 lg:border-e lg:border-border xl:w-[min(100%,28rem)]">
            <Section
              title="אבן מהקטלוג"
              className="flex-none justify-start border-b border-border py-6 lg:border-b-0 lg:pb-5"
            >
              {stone ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <div
                    className="size-12 shrink-0 rounded-lg border border-black/10 shadow-inner"
                    style={{ backgroundColor: stone.color_hex }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {stone.name}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      ליטוש: {stone.polish_type}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">אבן לא נמצאה</p>
              )}
              <p className="text-muted-foreground text-xs">
                בהזמנה : {row.quantity_reserved} · סופק:{" "}
                {row.quantity_delivered}
              </p>
            </Section>

            <Separator className="lg:hidden" />

            <Section
              title="מידות וכמות"
              className="flex-none justify-start py-6 lg:pt-2"
            >
              <div className="grid w-full gap-4 sm:grid-cols-3">
                <Field label="גובה / עובי (ס״מ)">
                  <Input
                    dir="ltr"
                    inputMode="decimal"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    step="any"
                    required
                  />
                </Field>
                <Field label="רוחב (ס״מ)">
                  <Input
                    dir="ltr"
                    inputMode="decimal"
                    value={widthCm}
                    onChange={(e) => setWidthCm(e.target.value)}
                    step="any"
                    required
                  />
                </Field>

                <Field label="אורך (ס״מ)">
                  <Input
                    dir="ltr"
                    inputMode="decimal"
                    value={lengthCm}
                    onChange={(e) => setLengthCm(e.target.value)}
                    step="any"
                    required
                  />
                </Field>
              </div>

              <div className="grid w-full gap-4 sm:grid-cols-2">
                <Field label="כמות במשלוח">
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    min={1}
                    step={1}
                    required
                  />
                </Field>
                <Field label="נפח משוער (קו״ב)" className="justify-end">
                  <div className="flex h-8 items-center rounded-lg border border-dashed border-border bg-muted/40 px-2.5 tabular-nums text-sm font-medium">
                    {volumePreview != null
                      ? new Intl.NumberFormat("he-IL", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 4,
                      }).format(volumePreview)
                      : "—"}
                  </div>
                </Field>
              </div>

              <Separator />

              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  מחירים
                </h3>
                <div className="grid w-full gap-4 sm:grid-cols-2">
                  <Field label="מחיר לקו״ב (₪)">
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={pricePerM3}
                      onChange={(e) => setPricePerM3(e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="מחיר ללקוח (₪)">
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={customerPrice}
                      onChange={(e) => setCustomerPrice(e.target.value)}
                      required
                    />
                  </Field>
                </div>
              </div>
            </Section>
          </div>

          <div className="flex min-h-[min(40vh,24rem)] flex-1 flex-col border-t border-border lg:min-h-0 lg:border-t-0">
            <InventoryOrdersPanel
              deliveryQuantityTotal={row.quantity_total}
              orderItemRows={orderItemRows}
            />
          </div>
        </div>

        <div className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-3 border-t border-border bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:flex-row md:items-end md:justify-between md:px-8">
          <Field label="סטטוס" className="min-w-[min(100%,12rem)] md:max-w-xs">
            <Select
              dir="rtl"
              value={status}
              onValueChange={(v) =>
                setStatus(v as InventoryItemViewRow["status"])
              }
              required
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {status === "in_transit" ? (
            <Field label="תאריך צפי הגעה" className="min-w-[min(100%,12rem)]">
              <Input
                type="date"
                dir="ltr"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                required
              />
            </Field>
          ) : null}
          {error ? (
            <p className="text-destructive text-sm md:flex-1">{error}</p>
          ) : (
            <span className="hidden md:block md:flex-1" />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/dashboard/inventory")}
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
