"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createQuote, updateQuote } from "./actions";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  CustomerRow,
  CustomerStonePriceRow,
  QuoteItemViewRow,
  QuoteViewRow,
  StoneRow,
} from "@/lib/db/types";
import {
  computeLineSubtotal,
  computeVolumeM3FromCm,
  metersToCmInput,
  pricePerM3ExVatFromInclusive,
  computeTotalWithVat,
  computeVatAmount,
} from "@/lib/db/calculations";
import { formatIls, formatVolumeM3 } from "@/lib/db/format";

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
  length_cm: string;
  width_cm: string;
  height_cm: string;
  quantity: string;
  price_per_m3: string;
};

function newEmptyLine(): Line {
  return {
    key: newLineKey(),
    stone_id: "",
    length_cm: "",
    width_cm: "",
    height_cm: "",
    quantity: "1",
    price_per_m3: "",
  };
}

function parseLineNumbers(ln: Line) {
  return {
    L: parseFloat(ln.length_cm.replace(",", ".")) || 0,
    W: parseFloat(ln.width_cm.replace(",", ".")) || 0,
    H: parseFloat(ln.height_cm.replace(",", ".")) || 0,
    Q: parseInt(ln.quantity.replace(",", "."), 10),
    p: parseFloat(ln.price_per_m3.replace(",", ".")),
  };
}

function isLineTouched(ln: Line): boolean {
  return !!(
    ln.stone_id ||
    ln.length_cm.trim() ||
    ln.width_cm.trim() ||
    ln.height_cm.trim() ||
    ln.price_per_m3.trim() ||
    (ln.quantity.trim() && ln.quantity !== "1")
  );
}

function isLineComplete(ln: Line): boolean {
  const { L, W, H, Q, p } = parseLineNumbers(ln);
  return !!(
    ln.stone_id &&
    L > 0 &&
    W > 0 &&
    H > 0 &&
    Number.isInteger(Q) &&
    Q > 0 &&
    !Number.isNaN(p) &&
    p >= 0
  );
}

function getLineIssues(ln: Line, index: number): string | null {
  if (!isLineTouched(ln)) return null;
  const prefix = `פריט ${index + 1}:`;
  if (!ln.stone_id) return `${prefix} חסרה בחירת אבן`;
  const { L, W, H, Q, p } = parseLineNumbers(ln);
  if (!L || !W || !H) return `${prefix} חסרות מידות תקינות`;
  if (!Number.isInteger(Q) || Q <= 0) return `${prefix} כמות לא תקינה`;
  if (Number.isNaN(p) || p < 0) return `${prefix} מחיר לא תקין`;
  return null;
}

function effectiveStonePrice(
  stoneId: string,
  forCustomerId: string,
  overrides: CustomerStonePriceRow[]
): number | null {
  if (!stoneId || !forCustomerId) return null;
  const ov = overrides.find(
    (o) => o.customer_id === forCustomerId && o.stone_id === stoneId
  );
  if (ov?.price_per_m3 != null) return Number(ov.price_per_m3);
  return null;
}

function validateLines(lines: Line[]): string | null {
  const complete = lines.filter(isLineComplete);
  if (complete.length === 0) {
    const touchedIncomplete = lines
      .map((ln, idx) => getLineIssues(ln, idx))
      .find((msg) => msg != null);
    if (touchedIncomplete) return touchedIncomplete;
    return "נא לבחור אבן מהקטלוג לפחות לפריט אחד";
  }
  for (let idx = 0; idx < lines.length; idx++) {
    const issue = getLineIssues(lines[idx], idx);
    if (issue) return issue;
  }
  return null;
}

function buildLineFromQuoteItem(ln: QuoteItemViewRow): Line {
  return {
    key: newLineKey(),
    stone_id: ln.stone_id,
    length_cm: metersToCmInput(Number(ln.length_m)),
    width_cm: metersToCmInput(Number(ln.width_m)),
    height_cm: metersToCmInput(Number(ln.height_m)),
    quantity: String(ln.quantity),
    price_per_m3: String(ln.price_per_m3),
  };
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

export function QuoteForm({
  mode,
  customers,
  stones,
  overrides,
  quote,
  initialLines = [],
}: {
  mode: "create" | "edit";
  customers: CustomerRow[];
  stones: StoneRow[];
  overrides: CustomerStonePriceRow[];
  quote?: QuoteViewRow;
  initialLines?: QuoteItemViewRow[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(quote?.customer_id ?? "");
  const [validUntil, setValidUntil] = useState(quote?.valid_until ?? "");
  const [notes, setNotes] = useState(quote?.notes ?? "");
  const [vatIncluded, setVatIncluded] = useState(quote?.vat_included ?? false);
  const [lines, setLines] = useState<Line[]>(() => {
    if (initialLines.length > 0) {
      return initialLines.map(buildLineFromQuoteItem);
    }
    return [newEmptyLine()];
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    setLines((prev) =>
      prev.map((ln) => {
        if (!ln.stone_id) return ln;
        const dp = effectiveStonePrice(ln.stone_id, nextCustomerId, overrides);
        if (dp == null || Number.isNaN(dp)) return ln;
        return { ...ln, price_per_m3: String(dp) };
      })
    );
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((ln) => {
        if (ln.key !== key) return ln;
        const next = { ...ln, ...patch };
        if (patch.stone_id != null && patch.stone_id !== ln.stone_id) {
          const dp = effectiveStonePrice(patch.stone_id, customerId, overrides);
          if (dp != null && !Number.isNaN(dp)) {
            next.price_per_m3 = String(dp);
          } else {
            next.price_per_m3 = "";
          }
        }
        return next;
      })
    );
  }

  const totalsPreview = useMemo(() => {
    let subtotalEx = 0;
    let totalVolumeM3 = 0;
    for (const ln of lines) {
      const L = parseFloat(ln.length_cm.replace(",", ".")) || 0;
      const W = parseFloat(ln.width_cm.replace(",", ".")) || 0;
      const H = parseFloat(ln.height_cm.replace(",", ".")) || 0;
      const Q = parseInt(ln.quantity.replace(",", "."), 10) || 0;
      const p = parseFloat(ln.price_per_m3.replace(",", ".")) || 0;
      if (!L || !W || !H || !Q) continue;
      const vol = computeVolumeM3FromCm({
        lengthCm: L,
        widthCm: W,
        heightCm: H,
        quantity: Q,
      });
      totalVolumeM3 += vol;
      if (!p) continue;
      const priceEx = vatIncluded
        ? pricePerM3ExVatFromInclusive(p, VAT_RATE)
        : p;
      subtotalEx += computeLineSubtotal(vol, priceEx);
    }
    const vat = computeVatAmount(subtotalEx, VAT_RATE);
    const total = computeTotalWithVat(subtotalEx, VAT_RATE);
    return { subtotalEx, vat, total, totalVolumeM3 };
  }, [lines, vatIncluded]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      setError("נא לבחור לקוח");
      return;
    }

    const validationError = validateLines(lines);
    if (validationError) {
      setError(validationError);
      return;
    }

    setPending(true);
    setError(null);

    const items = lines.filter(isLineComplete).map((ln) => {
      const { L, W, H, Q, p } = parseLineNumbers(ln);
      return {
        stone_id: ln.stone_id,
        length_m: L / 100,
        width_m: W / 100,
        height_m: H / 100,
        quantity: Q,
        price_per_m3: p,
      };
    });

    const payload = {
      customer_id: customerId,
      valid_until: validUntil || null,
      notes: notes.trim() || null,
      vat_rate: VAT_RATE,
      vat_included: vatIncluded,
      items,
    };

    const res =
      mode === "edit" && quote
        ? await updateQuote({ id: quote.id, ...payload })
        : await createQuote(payload);

    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.push(`/dashboard/quotes/${res.id ?? quote?.id}`);
    router.refresh();
  }

  const title =
    mode === "edit"
      ? `עריכת הצעת מחיר #${quote?.quote_number ?? ""}`
      : "הצעת מחיר חדשה";

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col overflow-y-scroll bg-background p-4 md:p-8">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-[min(100%,56rem)] flex-col gap-6"
      >
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-muted-foreground text-sm">
            בחרו לקוח, אבנים מהקטלוג, מידות ומחירים — ללא צורך במלאי.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="לקוח">
            <Select
              dir="rtl"
              value={customerId || undefined}
              onValueChange={handleCustomerChange}
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
          <Field label="תוקף ההצעה">
            <Input
              type="date"
              dir="ltr"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </Field>
          <Field label="הערות" className="sm:col-span-2">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="הערות פנימיות (אופציונלי)"
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
              onClick={() => setLines((prev) => [newEmptyLine(), ...prev])}
            >
              שורה נוספת
            </Button>
          </div>

          {lines.map((ln, idx) => {
            const L = parseFloat(ln.length_cm.replace(",", ".")) || 0;
            const W = parseFloat(ln.width_cm.replace(",", ".")) || 0;
            const H = parseFloat(ln.height_cm.replace(",", ".")) || 0;
            const Q = parseInt(ln.quantity.replace(",", "."), 10) || 0;
            const p = parseFloat(ln.price_per_m3.replace(",", ".")) || 0;
            const vol =
              L && W && H && Q
                ? computeVolumeM3FromCm({
                    lengthCm: L,
                    widthCm: W,
                    heightCm: H,
                    quantity: Q,
                  })
                : null;
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
                        setLines((prev) => prev.filter((x) => x.key !== ln.key))
                      }
                    >
                      הסרה
                    </Button>
                  ) : null}
                </div>
                <Field label="אבן מהקטלוג">
                  <Select
                    dir="rtl"
                    value={ln.stone_id || undefined}
                    onValueChange={(v) => updateLine(ln.key, { stone_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="בחר אבן" />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {stones.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="גובה / עובי (ס״מ)">
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={ln.height_cm}
                      onChange={(e) =>
                        updateLine(ln.key, { height_cm: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="רוחב (ס״מ)">
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={ln.width_cm}
                      onChange={(e) =>
                        updateLine(ln.key, { width_cm: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="אורך (ס״מ)">
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={ln.length_cm}
                      onChange={(e) =>
                        updateLine(ln.key, { length_cm: e.target.value })
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
                        updateLine(ln.key, { price_per_m3: e.target.value })
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
              <span className="text-muted-foreground">סה״כ קוב</span>
              <span className="tabular-nums font-medium">
                {totalsPreview.totalVolumeM3 > 0
                  ? `${formatVolumeM3(totalsPreview.totalVolumeM3)} קו״ב`
                  : "—"}
              </span>
            </div>
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

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard/quotes")}
          >
            ביטול
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? "שומר…"
              : mode === "edit"
                ? "שמירת שינויים"
                : "יצירת הצעה"}
          </Button>
        </div>
      </form>
    </div>
  );
}
