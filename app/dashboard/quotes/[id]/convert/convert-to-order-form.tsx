"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createOrderFromQuote } from "../../actions";
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
  QuoteItemViewRow,
  QuoteViewRow,
} from "@/lib/db/types";
import { formatInventoryShipmentSelectLabel } from "@/lib/db/inventory-taxonomy";
import {
  formatDimensionsCmFromMeters,
  formatIls,
  formatVolumeM3,
} from "@/lib/db/format";

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
  const [inventoryByLine, setInventoryByLine] = useState<Record<string, string>>(
    () => Object.fromEntries(lines.map((ln) => [ln.id, ""]))
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    for (const ln of lines) {
      if (!inventoryByLine[ln.id]) {
        setError(`נא לבחור משלוח במלאי לפריט: ${ln.stone_name}`);
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
      items: lines.map((ln) => ({
        quote_item_id: ln.id,
        inventory_item_id: inventoryByLine[ln.id],
      })),
    });

    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.push(`/dashboard/orders/${res.id}`);
    router.refresh();
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col overflow-y-scroll bg-background p-4 md:p-8">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-[min(100%,56rem)] flex-col gap-6"
      >
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            צור הזמנה מהצעה #{quote.quote_number}
          </h2>
          <p className="text-muted-foreground text-sm">
            {quote.customer_name} · סכום הצעה: {formatIls(quote.total)}
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
          <h3 className="font-semibold text-foreground">בחירת משלוח מלאי</h3>
          {lines.map((ln, idx) => {
            const opts = inventoryForLine(ln);
            return (
              <div
                key={ln.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
              >
                <span className="text-muted-foreground text-xs">
                  פריט {idx + 1}: {ln.stone_name}
                </span>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p>
                    מידות:{" "}
                    {formatDimensionsCmFromMeters(
                      Number(ln.length_m),
                      Number(ln.width_m),
                      Number(ln.height_m)
                    )}
                  </p>
                  <p>כמות: {ln.quantity}</p>
                  <p>נפח: {formatVolumeM3(Number(ln.volume_m3))}</p>
                  <p>מחיר לקו״ב: {formatIls(Number(ln.price_per_m3))}</p>
                </div>
                <Field label="משלוח במלאי">
                  <Select
                    dir="rtl"
                    value={inventoryByLine[ln.id] || undefined}
                    onValueChange={(v) =>
                      setInventoryByLine((prev) => ({ ...prev, [ln.id]: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          opts.length > 0
                            ? "בחר משלוח"
                            : "אין מלאי זמין מתאים"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {opts.map((i) => (
                        <SelectItem
                          key={i.id}
                          value={i.id}
                          textValue={formatInventoryShipmentSelectLabel(i)}
                        >
                          {formatInventoryShipmentSelectLabel(i)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {opts.length === 0 ? (
                  <p className="text-destructive text-sm">
                    אין משלוח עם מלאי זמין ({ln.quantity} יחידות) לאבן זו.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
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
        </div>
      </form>
    </div>
  );
}
