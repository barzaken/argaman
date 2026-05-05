"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createInventoryItem } from "../actions";
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
import type { StoneRow } from "@/lib/db/types";
import { computeVolumeM3FromCm } from "@/lib/db/calculations";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "available", label: "זמין" },
  { value: "unavailable", label: "לא זמין" },
  { value: "in_transit", label: "בדרך" },
];

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

export function NewInventoryForm({ stones }: { stones: StoneRow[] }) {
  const router = useRouter();
  const [selectedStoneId, setSelectedStoneId] = useState<string>("");
  const [lengthCm, setLengthCm] = useState("240");
  const [widthCm, setWidthCm] = useState("135");
  const [heightCm, setHeightCm] = useState("2");
  const [quantity, setQuantity] = useState("1");
  const [pricePerM3, setPricePerM3] = useState("");
  const [customerPrice, setCustomerPrice] = useState("");
  const [status, setStatus] = useState<string>("available");
  const [expectedDate, setExpectedDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selectedStone = useMemo(
    () =>
      stones.find((s) => String(s.id) === selectedStoneId) ?? null,
    [stones, selectedStoneId]
  );

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
    if (!selectedStoneId || !selectedStone) return;
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("stone_id", selectedStoneId);
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
    const res = await createInventoryItem(fd);
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.push("/dashboard/inventory");
    router.refresh();
  }

  const selectableStones = stones.filter((s) => s.is_active);

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
              <Field label="בחר אבן מקטלוג האבן">
                <Select
                  dir="rtl"
                  value={selectedStoneId || undefined}
                  onValueChange={setSelectedStoneId}
                  required
                >
                  <SelectTrigger className="w-full py-8">
                    <SelectValue placeholder="בחר אבן מהרשימה" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {selectableStones.map((stone) => (
                      <SelectItem
                        key={stone.id}
                        value={String(stone.id)}
                        textValue={`${stone.name} ${stone.polish_type}`}
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
                          <span className="truncate font-medium">
                            {stone.name}
                          </span>
                          <span className="truncate text-muted-foreground text-xs">
                            {stone.polish_type}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {selectedStone ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <div
                    className="size-12 shrink-0 rounded-lg border border-black/10 shadow-inner"
                    style={{ backgroundColor: selectedStone.color_hex }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {selectedStone.name}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      ליטוש: {selectedStone.polish_type}
                    </p>
                  </div>
                </div>
              ) : null}
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
                      placeholder="4200"
                      required
                    />
                  </Field>
                  <Field label="מחיר ללקוח (₪)">
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={customerPrice}
                      onChange={(e) => setCustomerPrice(e.target.value)}
                      placeholder="4899"
                      required
                    />
                  </Field>
                </div>
              </div>
            </Section>
          </div>

          <div
            className="hidden min-h-0 shrink-0 lg:block lg:flex-1"
            aria-hidden
          />
        </div>

        <div className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-3 border-t border-border bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:flex-row md:items-end md:justify-between md:px-8">
          <Field label="סטטוס" className="min-w-[min(100%,12rem)] md:max-w-xs">
            <Select
              dir="rtl"
              value={status}
              onValueChange={setStatus}
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
