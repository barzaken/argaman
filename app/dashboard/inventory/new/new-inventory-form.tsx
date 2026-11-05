"use client";

import { toast } from "sonner";
import { actionCrashed } from "@/lib/action-client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createInventoryItem } from "../actions";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  computeAreaM2FromCm,
  computeVolumeM3FromCm,
  convertUnitPriceInput,
  normalizeDecimalInput,
} from "@/lib/db/calculations";
import { formatAreaM2 } from "@/lib/db/format";
import {
  INVENTORY_FINISH_LEVEL_OPTIONS,
  INVENTORY_PIECE_TYPE_OPTIONS,
} from "@/lib/db/inventory-taxonomy";
import type {
  InventoryFinishLevelDb,
  InventoryPieceTypeDb,
  InventoryPricingUnitDb,
  StoneRow,
} from "@/lib/db/types";

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
    // <label> עוטף את השדה — שם נגיש לקורא מסך ולחיצה על הכותרת מפעילה את השדה
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
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
  const [pricingUnit, setPricingUnit] =
    useState<InventoryPricingUnitDb>("m3");
  const [pricePerM3, setPricePerM3] = useState("");
  const [pricePerM2, setPricePerM2] = useState("");
  const [customerPrice, setCustomerPrice] = useState("");
  const [status, setStatus] = useState<string>("available");
  const [finishLevel, setFinishLevel] =
    useState<InventoryFinishLevelDb>("halak");
  const [pieceType, setPieceType] =
    useState<InventoryPieceTypeDb>("panel");
  const [expectedDate, setExpectedDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selectedStone = useMemo(
    () =>
      stones.find((s) => String(s.id) === selectedStoneId) ?? null,
    [stones, selectedStoneId]
  );

  const volumePreview = useMemo(() => {
    const L = parseFloat(normalizeDecimalInput(lengthCm)) || 0;
    const W = parseFloat(normalizeDecimalInput(widthCm)) || 0;
    const H = parseFloat(normalizeDecimalInput(heightCm)) || 0;
    const Q = Number(normalizeDecimalInput(quantity)) || 0;
    if (!L || !W || !H || !Q) return null;
    return computeVolumeM3FromCm({
      lengthCm: L,
      widthCm: W,
      heightCm: H,
      quantity: Q,
    });
  }, [lengthCm, widthCm, heightCm, quantity]);

  const areaPreview = useMemo(() => {
    const L = parseFloat(normalizeDecimalInput(lengthCm)) || 0;
    const W = parseFloat(normalizeDecimalInput(widthCm)) || 0;
    const Q = Number(normalizeDecimalInput(quantity)) || 0;
    if (!L || !W || !Q) return null;
    return computeAreaM2FromCm({ lengthCm: L, widthCm: W, quantity: Q });
  }, [lengthCm, widthCm, quantity]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStoneId || !selectedStone) return;
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("stone_id", selectedStoneId);
    const L = parseFloat(normalizeDecimalInput(lengthCm)) || 0;
    const W = parseFloat(normalizeDecimalInput(widthCm)) || 0;
    const H =
      parseFloat(normalizeDecimalInput(heightCm)) ||
      (pricingUnit === "m2" ? 2 : 0);
    fd.set("length_m", String(L / 100));
    fd.set("width_m", String(W / 100));
    fd.set("height_m", String(H / 100));
    fd.set("quantity_total", quantity);
    fd.set("pricing_unit", pricingUnit);
    if (pricingUnit === "m3") {
      fd.set("price_per_m3", normalizeDecimalInput(pricePerM3));
    } else {
      fd.set("price_per_m2", normalizeDecimalInput(pricePerM2));
    }
    fd.set("customer_price", normalizeDecimalInput(customerPrice));
    fd.set("status", status);
    fd.set("finish_level", finishLevel);
    fd.set("piece_type", pieceType);
    if (status === "in_transit") fd.set("expected_arrival_date", expectedDate);
    const res = await createInventoryItem(fd).catch(actionCrashed);
    if (!res.ok) {
      setPending(false);
      setError(res.message);
      return;
    }
    toast.success("הפריט נוסף למלאי");
    router.push("/dashboard/inventory");
  }

  const selectableStones = stones.filter((s) => s.is_active);

  return (
    <FormPageShell>
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:items-stretch">
          <div className="flex min-h-0 w-full flex-col overflow-y-auto lg:w-[min(100%,26rem)] lg:shrink-0 lg:border-e lg:border-border xl:w-[min(100%,28rem)]">
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
                        textValue={stone.name}
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
                          <span className="truncate font-medium">
                            {stone.name}
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
                  </div>
                </div>
              ) : null}
            </Section>

            <Separator className="lg:hidden" />

            <Section
              title="מידות וכמות"
              className="flex-none justify-start py-6 pb-8 lg:pt-2"
            >
              <Tabs
                value={pricingUnit}
                onValueChange={(v) => {
                  const next = v as InventoryPricingUnitDb;
                  if (next === pricingUnit) return;
                  // ממירים את המחירים ליחידה החדשה — אחרת 4,899 לקו״ב
                  // נשמר בטעות כ-4,899 למ״ר (פי 50 בעובי 2 ס״מ).
                  const H = parseFloat(normalizeDecimalInput(heightCm)) || 0;
                  setCustomerPrice((c) => convertUnitPriceInput(c, next, H));
                  if (next === "m2") {
                    setPricePerM2(convertUnitPriceInput(pricePerM3, "m2", H));
                  } else {
                    setPricePerM3(convertUnitPriceInput(pricePerM2, "m3", H));
                  }
                  setPricingUnit(next);
                }}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="m3" className="flex-1">
                    לפי קוב
                  </TabsTrigger>
                  <TabsTrigger value="m2" className="flex-1">
                    לפי מ״ר
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="grid w-full gap-4 sm:grid-cols-2">
                <Field label="רמת גימור">
                  <Select
                    dir="rtl"
                    value={finishLevel}
                    onValueChange={(v) =>
                      setFinishLevel(v as InventoryFinishLevelDb)
                    }
                    required
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {INVENTORY_FINISH_LEVEL_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="חלק">
                  <Select
                    dir="rtl"
                    value={pieceType}
                    onValueChange={(v) =>
                      setPieceType(v as InventoryPieceTypeDb)
                    }
                    required
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {INVENTORY_PIECE_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div
                className={cn(
                  "grid w-full gap-4",
                  pricingUnit === "m3" ? "sm:grid-cols-3" : "sm:grid-cols-2"
                )}
              >
                {pricingUnit === "m3" ? (
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
                ) : (
                  <Field label="עובי (ס״מ)">
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={heightCm}
                      onChange={(e) => setHeightCm(e.target.value)}
                      placeholder="2"
                      step="any"
                    />
                  </Field>
                )}
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
                <Field
                  label={
                    pricingUnit === "m3"
                      ? "נפח משוער (קו״ב)"
                      : "שטח פנים (מ״ר)"
                  }
                  className="justify-end"
                >
                  <div className="flex h-8 items-center rounded-lg border border-dashed border-border bg-muted/40 px-2.5 tabular-nums text-sm font-medium">
                    {pricingUnit === "m3"
                      ? volumePreview != null
                        ? new Intl.NumberFormat("he-IL", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 4,
                          }).format(volumePreview)
                        : "—"
                      : areaPreview != null
                        ? formatAreaM2(areaPreview)
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
                  {pricingUnit === "m3" ? (
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
                  ) : (
                    <Field label="מחיר למ״ר (₪)">
                      <Input
                        dir="ltr"
                        inputMode="decimal"
                        value={pricePerM2}
                        onChange={(e) => setPricePerM2(e.target.value)}
                        placeholder="850"
                        required
                      />
                    </Field>
                  )}
                  <Field
                    label={
                      pricingUnit === "m3"
                        ? "מחיר ללקוח (₪)"
                        : "מחיר ללקוח למ״ר (₪)"
                    }
                  >
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

        <FormStickyFooter className="flex-col md:flex-row md:items-end md:justify-between">
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
        </FormStickyFooter>
      </form>
    </FormPageShell>
  );
}
