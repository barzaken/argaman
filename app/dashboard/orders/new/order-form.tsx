"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createOrder } from "../actions";
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
  CustomerInventoryPriceRow,
  CustomerRow,
  InventoryItemViewRow,
  StoneRow,
} from "@/lib/db/types";
import {
  computeLineSubtotal,
  computeVolumeM3,
  pricePerM3ExVatFromInclusive,
  computeTotalWithVat,
  computeVatAmount,
} from "@/lib/db/calculations";
import { formatIls } from "@/lib/db/format";

const VAT_RATE = 0.18;

function newLineKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `ln-${Math.random().toString(36).slice(2)}`;
}

type Line = {
  key: string;
  stone_id: string;
  inventory_item_id: string;
  length_m: string;
  width_m: string;
  height_m: string;
  quantity: string;
  price_per_m3: string;
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
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

export function OrderForm({
  customers,
  stones,
  inventory,
  overrides,
}: {
  customers: CustomerRow[];
  stones: StoneRow[];
  inventory: InventoryItemViewRow[];
  overrides: CustomerInventoryPriceRow[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "urgent">(
    "medium"
  );
  const [supplyDue, setSupplyDue] = useState("");
  const [signatureUrl, setSignatureUrl] = useState("");
  const [vatIncluded, setVatIncluded] = useState(false);
  const [lines, setLines] = useState<Line[]>([
    {
      key: newLineKey(),
      stone_id: "",
      inventory_item_id: "",
      length_m: "",
      width_m: "",
      height_m: "",
      quantity: "1",
      price_per_m3: "",
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function inventoryForStone(stoneId: string) {
    return inventory.filter(
      (i) =>
        i.stone_id === stoneId &&
        i.quantity_available > 0 &&
        i.status === "available"
    );
  }

  function defaultPricePerM3(invId: string): number | null {
    if (!customerId || !invId) return null;
    const invRow = inventory.find((i) => i.id === invId);
    if (!invRow) return null;
    const ov = overrides.find(
      (o) =>
        o.customer_id === customerId && o.inventory_item_id === invId
    );
    const base = ov?.price_per_m3 ?? invRow.price_per_m3;
    return Number(base);
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((ln) => {
        if (ln.key !== key) return ln;
        const next = { ...ln, ...patch };
        if (patch.inventory_item_id != null && patch.inventory_item_id !== ln.inventory_item_id) {
          const invRow = inventory.find((i) => i.id === patch.inventory_item_id);
          if (invRow) {
            next.length_m = String(invRow.length_m);
            next.width_m = String(invRow.width_m);
            next.height_m = String(invRow.height_m);
            const dp = defaultPricePerM3(invRow.id);
            if (dp != null) next.price_per_m3 = String(dp);
          }
        }
        if (
          patch.stone_id != null &&
          patch.stone_id !== ln.stone_id
        ) {
          next.inventory_item_id = "";
          next.length_m = "";
          next.width_m = "";
          next.height_m = "";
          next.price_per_m3 = "";
        }
        return next;
      })
    );
  }

  const totalsPreview = useMemo(() => {
    let subtotalEx = 0;
    for (const ln of lines) {
      const L = parseFloat(ln.length_m.replace(",", ".")) || 0;
      const W = parseFloat(ln.width_m.replace(",", ".")) || 0;
      const H = parseFloat(ln.height_m.replace(",", ".")) || 0;
      const Q = parseInt(ln.quantity.replace(",", "."), 10) || 0;
      const p = parseFloat(ln.price_per_m3.replace(",", ".")) || 0;
      if (!L || !W || !H || !Q || !p) continue;
      const vol = computeVolumeM3({ lengthM: L, widthM: W, heightM: H, quantity: Q });
      const priceEx = vatIncluded
        ? pricePerM3ExVatFromInclusive(p, VAT_RATE)
        : p;
      subtotalEx += computeLineSubtotal(vol, priceEx);
    }
    const vat = computeVatAmount(subtotalEx, VAT_RATE);
    const total = computeTotalWithVat(subtotalEx, VAT_RATE);
    return { subtotalEx, vat, total };
  }, [lines, vatIncluded]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      setError("נא לבחור לקוח");
      return;
    }
    setPending(true);
    setError(null);

    const items = lines
      .filter((ln) => ln.stone_id && ln.inventory_item_id)
      .map((ln) => ({
        stone_id: ln.stone_id,
        inventory_item_id: ln.inventory_item_id,
        length_m: parseFloat(ln.length_m.replace(",", ".")),
        width_m: parseFloat(ln.width_m.replace(",", ".")),
        height_m: parseFloat(ln.height_m.replace(",", ".")),
        quantity: parseInt(ln.quantity.replace(",", "."), 10),
        price_per_m3: parseFloat(ln.price_per_m3.replace(",", ".")),
      }));

    const res = await createOrder({
      customer_id: customerId,
      priority,
      supply_due_date: supplyDue || null,
      signature_url: signatureUrl.trim() || null,
      vat_rate: VAT_RATE,
      vat_included: vatIncluded,
      items,
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
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col overflow-auto bg-background p-4 md:p-8">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-[min(100%,56rem)] flex-col gap-6"
      >
        <div>
          <h2 className="text-lg font-semibold text-foreground">תעודת הזמנה חדשה</h2>
          <p className="text-muted-foreground text-sm">
            בחרו לקוח, פריטים ממשלוחי מלאי ומחירים.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="לקוח">
            <Select
              dir="rtl"
              value={customerId || undefined}
              onValueChange={setCustomerId}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="בחר לקוח" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
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
          <Field label="קישור לחתימה">
            <Input
              dir="ltr"
              value={signatureUrl}
              onChange={(e) => setSignatureUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={vatIncluded}
            onChange={(e) => setVatIncluded(e.target.checked)}
          />
          מחיר לקו״ב כולל מע״מ (יומר לנטו לפני שמירה)
        </label>

        <Separator />

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-foreground">פריטים</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setLines((prev) => [
                  ...prev,
                  {
                    key: newLineKey(),
                    stone_id: "",
                    inventory_item_id: "",
                    length_m: "",
                    width_m: "",
                    height_m: "",
                    quantity: "1",
                    price_per_m3: "",
                  },
                ])
              }
            >
              שורה נוספת
            </Button>
          </div>

          {lines.map((ln, idx) => {
            const invOptions = ln.stone_id
              ? inventoryForStone(ln.stone_id)
              : [];
            const L = parseFloat(ln.length_m.replace(",", ".")) || 0;
            const W = parseFloat(ln.width_m.replace(",", ".")) || 0;
            const H = parseFloat(ln.height_m.replace(",", ".")) || 0;
            const Q = parseInt(ln.quantity.replace(",", "."), 10) || 0;
            const p = parseFloat(ln.price_per_m3.replace(",", ".")) || 0;
            const vol =
              L && W && H && Q ? computeVolumeM3({ lengthM: L, widthM: W, heightM: H, quantity: Q }) : null;
            const priceEx =
              vol != null && p
                ? vatIncluded
                  ? pricePerM3ExVatFromInclusive(p, VAT_RATE)
                  : p
                : null;
            const lineSub =
              vol != null && priceEx != null
                ? computeLineSubtotal(vol, priceEx)
                : null;

            return (
              <div
                key={ln.key}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs">
                    פריט {idx + 1}
                  </span>
                  {lines.length > 1 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setLines((prev) =>
                          prev.filter((x) => x.key !== ln.key)
                        )
                      }
                    >
                      הסרה
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="אבן מהקטלוג">
                    <Select
                      dir="rtl"
                      value={ln.stone_id || undefined}
                      onValueChange={(v) =>
                        updateLine(ln.key, { stone_id: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="בחר אבן" />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        {stones.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} · {s.polish_type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="משלוח במלאי">
                    <Select
                      dir="rtl"
                      value={ln.inventory_item_id || undefined}
                      onValueChange={(v) =>
                        updateLine(ln.key, { inventory_item_id: v })
                      }
                      disabled={!ln.stone_id}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="בחר משלוח" />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        {invOptions.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            זמין {i.quantity_available} · נפח משלוח{" "}
                            {i.volume_m3} קו״ב
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="אורך">
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={ln.length_m}
                      onChange={(e) =>
                        updateLine(ln.key, { length_m: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="רוחב">
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={ln.width_m}
                      onChange={(e) =>
                        updateLine(ln.key, { width_m: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="גובה">
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={ln.height_m}
                      onChange={(e) =>
                        updateLine(ln.key, { height_m: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="כמות">
                    <Input
                      dir="ltr"
                      inputMode="numeric"
                      value={ln.quantity}
                      onChange={(e) =>
                        updateLine(ln.key, { quantity: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="מחיר לקו״ב (₪)">
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={ln.price_per_m3}
                      onChange={(e) =>
                        updateLine(ln.key, {
                          price_per_m3: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="תצוגת שורה (נטו לפני מע״מ)">
                    <div className="rounded-lg border border-dashed border-border bg-muted/40 px-2 py-2 text-sm tabular-nums">
                      נפח:{" "}
                      {vol != null
                        ? new Intl.NumberFormat("he-IL", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 4,
                          }).format(vol)
                        : "—"}{" "}
                      · סכום: {lineSub != null ? formatIls(lineSub) : "—"}
                    </div>
                  </Field>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">סכום לפני מע״מ</span>
              <span className="tabular-nums font-medium">
                {formatIls(totalsPreview.subtotalEx)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">מע״מ ({VAT_RATE * 100}%)</span>
              <span className="tabular-nums font-medium">
                {formatIls(totalsPreview.vat)}
              </span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between gap-4">
              <span className="font-semibold text-foreground">סה״כ כולל מע״מ</span>
              <span className="tabular-nums font-semibold">
                {formatIls(totalsPreview.total)}
              </span>
            </div>
          </div>
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard/orders")}
          >
            ביטול
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "יוצר…" : "יצירת הזמנה"}
          </Button>
        </div>
      </form>
    </div>
  );
}
