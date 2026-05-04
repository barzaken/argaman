"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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
import { stonesCatalogData } from "../../stones/stones-demo-data";
import {
  computeVolumeM3,
  type InventoryStatus,
} from "../inventory-demo-data";

const STATUS_OPTIONS: { value: InventoryStatus; label: string }[] = [
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

export default function NewInventoryPage() {
  const router = useRouter();
  const [selectedStoneId, setSelectedStoneId] = useState<string>("");
  const [lengthM, setLengthM] = useState("2.4");
  const [widthM, setWidthM] = useState("1.35");
  const [heightM, setHeightM] = useState("0.02");
  const [quantity, setQuantity] = useState("1");
  const [pricePerM3, setPricePerM3] = useState("");
  const [customerPrice, setCustomerPrice] = useState("");
  const [status, setStatus] = useState<InventoryStatus>("available");

  const selectedStone = useMemo(
    () =>
      stonesCatalogData.find((s) => String(s.id) === selectedStoneId) ?? null,
    [selectedStoneId]
  );

  const volumePreview = useMemo(() => {
    const L = parseFloat(lengthM.replace(",", ".")) || 0;
    const W = parseFloat(widthM.replace(",", ".")) || 0;
    const H = parseFloat(heightM.replace(",", ".")) || 0;
    const Q = parseInt(quantity.replace(",", "."), 10) || 0;
    if (!L || !W || !H || !Q) return null;
    return computeVolumeM3({ lengthM: L, widthM: W, heightM: H, quantity: Q });
  }, [lengthM, widthM, heightM, quantity]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStoneId || !selectedStone) return;
    router.push("/dashboard/inventory");
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
                    {stonesCatalogData
                      .filter((s) => s.available)
                      .map((stone) => (
                        <SelectItem
                          key={stone.id}
                          value={String(stone.id)}
                          textValue={`${stone.name} ${stone.polishType}`}
                        >
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
                            <span className="truncate font-medium">
                              {stone.name}
                            </span>
                            <span className="truncate text-muted-foreground text-xs">
                              {stone.polishType}
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
                    style={{ backgroundColor: selectedStone.color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {selectedStone.name}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      ליטוש: {selectedStone.polishType}
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
                <Field label="אורך (מ׳)">
                  <Input
                    dir="ltr"
                    inputMode="decimal"
                    value={lengthM}
                    onChange={(e) => setLengthM(e.target.value)}
                    step="any"
                    required
                  />
                </Field>
                <Field label="רוחב (מ׳)">
                  <Input
                    dir="ltr"
                    inputMode="decimal"
                    value={widthM}
                    onChange={(e) => setWidthM(e.target.value)}
                    step="any"
                    required
                  />
                </Field>
                <Field label="גובה (מ׳)">
                  <Input
                    dir="ltr"
                    inputMode="decimal"
                    value={heightM}
                    onChange={(e) => setHeightM(e.target.value)}
                    step="any"
                    required
                  />
                </Field>
              </div>

              <div className="grid w-full gap-4 sm:grid-cols-2">
                <Field label="כמות">
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

              <div className="space-y-4">
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
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as InventoryStatus)
              }
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/dashboard/inventory")}
            >
              ביטול
            </Button>
            <Button type="submit">שמירה</Button>
          </div>
        </div>
      </form>
    </div>
  );
}
