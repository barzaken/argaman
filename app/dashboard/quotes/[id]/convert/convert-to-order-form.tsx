"use client";

import { toast } from "sonner";
import { actionCrashed } from "@/lib/action-client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createOrderFromQuote } from "../../actions";
import {
  FormPageShell,
  FormStickyFooter,
} from "@/components/form-sticky-footer";
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
  InventoryFinishLevelDb,
  InventoryItemViewRow,
  InventoryPieceTypeDb,
  QuoteItemViewRow,
  QuoteViewRow,
} from "@/lib/db/types";
import {
  formatInventoryShipmentSelectLabel,
  INVENTORY_FINISH_LEVEL_OPTIONS,
  INVENTORY_PIECE_TYPE_OPTIONS,
} from "@/lib/db/inventory-taxonomy";
import {
  formatAreaM2,
  formatDimensionsCmFromMeters,
  formatIls,
  formatVolumeM3,
} from "@/lib/db/format";
import { quotePriceLabel } from "@/lib/db/calculations";
import { groupLinesByStone } from "@/lib/orders/stone-item-numbers";

const NOT_IN_STOCK = "__not_in_inventory__";

type LineSource = {
  inventory_item_id: string;
  not_in_inventory: boolean;
  finish_level: InventoryFinishLevelDb;
  piece_type: InventoryPieceTypeDb;
};

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
    // <label> עוטף את השדה — שם נגיש לקורא מסך ולחיצה על הכותרת מפעילה את השדה
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function defaultSourceForLine(
  ln: QuoteItemViewRow,
  inventory: InventoryItemViewRow[]
): LineSource {
  const opts = inventory.filter(
    (i) =>
      i.stone_id === ln.stone_id &&
      i.quantity_available >= ln.quantity &&
      i.status === "available"
  );
  if (opts.length === 0) {
    return {
      inventory_item_id: "",
      not_in_inventory: true,
      finish_level: "halak",
      piece_type: "panel",
    };
  }
  return {
    inventory_item_id: opts.length === 1 ? opts[0].id : "",
    not_in_inventory: false,
    finish_level: "halak",
    piece_type: "panel",
  };
}

export function ConvertToOrderForm({
  quote,
  lines,
  inventory,
}: {
  quote: QuoteViewRow;
  lines: QuoteItemViewRow[];
  inventory: InventoryItemViewRow[];
}) {
  const router = useRouter();
  const [priority, setPriority] = useState<"low" | "medium" | "urgent">(
    "medium"
  );
  const [supplyDue, setSupplyDue] = useState("");
  const [signatureUrl, setSignatureUrl] = useState("");
  const [sources, setSources] = useState<Record<string, LineSource>>(() =>
    Object.fromEntries(
      lines.map((ln) => [ln.id, defaultSourceForLine(ln, inventory)])
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const stoneGroups = useMemo(
    () => groupLinesByStone(lines.map((ln) => ({ ...ln, key: ln.id }))),
    [lines]
  );

  function inventoryForLine(ln: QuoteItemViewRow) {
    return inventory
      .filter(
        (i) =>
          i.stone_id === ln.stone_id &&
          i.quantity_available >= ln.quantity &&
          i.status === "available"
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  function updateSource(lineId: string, patch: Partial<LineSource>) {
    setSources((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], ...patch },
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    for (const ln of lines) {
      const src = sources[ln.id];
      if (!src?.not_in_inventory && !src?.inventory_item_id) {
        setError(`נא לבחור משלוח או ״לא במלאי״ לפריט: ${ln.stone_name}`);
        return;
      }
    }

    setPending(true);
    setError(null);

    const res = await createOrderFromQuote({
      quote_id: quote.id,
      priority,
      supply_due_date: supplyDue || null,
      signature_url: signatureUrl.trim() || null,
      items: lines.map((ln) => {
        const src = sources[ln.id];
        return {
          quote_item_id: ln.id,
          inventory_item_id: src.not_in_inventory
            ? null
            : src.inventory_item_id,
          not_in_inventory: src.not_in_inventory,
          finish_level: src.not_in_inventory ? src.finish_level : null,
          piece_type: src.not_in_inventory ? src.piece_type : null,
        };
      }),
    }).catch(actionCrashed);
    if (!res.ok) {
      setPending(false);
      setError(res.message);
      return;
    }
    toast.success("ההצעה הומרה להזמנה");
    router.push(`/dashboard/orders/${res.id}`);
  }

  return (
    <FormPageShell>
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto flex w-full max-w-[min(100%,56rem)] flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                צור הזמנה מהצעה #{quote.quote_number}
              </h2>
              <p className="text-muted-foreground text-sm">
                {quote.customer_name} · סכום הצעה: {formatIls(quote.total)}.
                אפשר לבחור משלוח במלאי או ליצור כפריט שלא במלאי (ייווצר
                וייגרע).
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="תעדוף">
                <Select
                  dir="rtl"
                  value={priority}
                  onValueChange={(v) =>
                    setPriority(v as "low" | "medium" | "urgent")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="low">נמוך</SelectItem>
                    <SelectItem value="medium">בינוני</SelectItem>
                    <SelectItem value="urgent">דחוף</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="יעד אספקה">
                <Input
                  type="date"
                  dir="ltr"
                  value={supplyDue}
                  onChange={(e) => setSupplyDue(e.target.value)}
                />
              </Field>
              <Field label="קישור לחתימה" className="sm:col-span-2">
                <Input
                  dir="ltr"
                  value={signatureUrl}
                  onChange={(e) => setSignatureUrl(e.target.value)}
                  placeholder="https://…"
                />
              </Field>
            </div>

            <Separator />

            <div className="flex flex-col gap-4">
              <h3 className="font-semibold text-foreground">פריטים</h3>

              {stoneGroups.map((group) => (
                <div
                  key={group.groupKey}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {group.itemNumber != null
                        ? `פריט ${group.itemNumber}`
                        : "פריט"}{" "}
                      · {group.lines[0]?.stone_name}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {group.lines.length} שורות
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {group.lines.map((ln, rowIdx) => {
                      const opts = inventoryForLine(ln);
                      const src = sources[ln.id];
                      const unit = ln.pricing_unit ?? "m3";
                      const priceLabel = quotePriceLabel(unit).replace(
                        " (₪)",
                        ""
                      );
                      const measureLabel =
                        unit === "m2"
                          ? formatAreaM2(Number(ln.area_m2))
                          : unit === "unit"
                            ? `${ln.quantity} יח׳`
                            : formatVolumeM3(Number(ln.volume_m3));
                      const priceValue =
                        unit === "m2"
                          ? formatIls(Number(ln.price_per_m2))
                          : unit === "unit"
                            ? formatIls(Number(ln.price_per_unit))
                            : formatIls(Number(ln.price_per_m3));
                      const selectValue = src.not_in_inventory
                        ? NOT_IN_STOCK
                        : src.inventory_item_id || undefined;

                      return (
                        <div
                          key={ln.id}
                          className="flex flex-col gap-2 rounded-md border border-border/70 bg-muted/15 px-3 py-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>שורה {rowIdx + 1}</span>
                            <span className="tabular-nums">
                              {formatDimensionsCmFromMeters(
                                Number(ln.length_m),
                                Number(ln.width_m),
                                Number(ln.height_m)
                              )}{" "}
                              · ×{ln.quantity} · {measureLabel} · {priceLabel}{" "}
                              {priceValue}
                            </span>
                          </div>

                          <Field label="מקור">
                            <Select
                              dir="rtl"
                              value={selectValue}
                              onValueChange={(v) => {
                                if (v === NOT_IN_STOCK) {
                                  updateSource(ln.id, {
                                    not_in_inventory: true,
                                    inventory_item_id: "",
                                  });
                                  return;
                                }
                                updateSource(ln.id, {
                                  not_in_inventory: false,
                                  inventory_item_id: v,
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="בחר משלוח או לא במלאי" />
                              </SelectTrigger>
                              <SelectContent dir="rtl">
                                <SelectItem value={NOT_IN_STOCK}>
                                  לא במלאי — ייווצר וייגרע
                                </SelectItem>
                                {opts.map((i) => (
                                  <SelectItem
                                    key={i.id}
                                    value={i.id}
                                    textValue={formatInventoryShipmentSelectLabel(
                                      i
                                    )}
                                  >
                                    {formatInventoryShipmentSelectLabel(i)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>

                          {src.not_in_inventory ? (
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Field label="רמת גימור">
                                <Select
                                  dir="rtl"
                                  value={src.finish_level}
                                  onValueChange={(v) =>
                                    updateSource(ln.id, {
                                      finish_level:
                                        v as InventoryFinishLevelDb,
                                    })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent dir="rtl">
                                    {INVENTORY_FINISH_LEVEL_OPTIONS.map(
                                      (o) => (
                                        <SelectItem
                                          key={o.value}
                                          value={o.value}
                                        >
                                          {o.label}
                                        </SelectItem>
                                      )
                                    )}
                                  </SelectContent>
                                </Select>
                              </Field>
                              <Field label="חלק">
                                <Select
                                  dir="rtl"
                                  value={src.piece_type}
                                  onValueChange={(v) =>
                                    updateSource(ln.id, {
                                      piece_type: v as InventoryPieceTypeDb,
                                    })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent dir="rtl">
                                    {INVENTORY_PIECE_TYPE_OPTIONS.map((o) => (
                                      <SelectItem
                                        key={o.value}
                                        value={o.value}
                                      >
                                        {o.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </Field>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <FormStickyFooter className="justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/quotes/${quote.id}`)}
          >
            ביטול
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "יוצר הזמנה…" : "יצירת הזמנה"}
          </Button>
        </FormStickyFooter>
      </form>
    </FormPageShell>
  );
}
