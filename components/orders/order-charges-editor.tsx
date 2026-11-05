"use client";

import { Lock, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeDecimalInput, roundMoney } from "@/lib/db/calculations";
import { formatIls } from "@/lib/db/format";
import { orderChargeKindLabels, orderChargeKindOptions } from "@/lib/db/labels";
import type { OrderChargeKindDb, OrderChargeRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/** שורת חיוב בטופס. amount = הסכום כפי שהוקלד (חיובי גם בהנחה). */
export type ChargeDraft = {
  key: string;
  /** קיים ב-DB (עריכה) */
  id?: string;
  kind: OrderChargeKindDb;
  description: string;
  amount: string;
};

/** מה שנשלח לשרת: סכום חיובי כפי שהוקלד; השרת ממיר לנטו ומסמן הנחה כשלילית */
export type ChargePayload = {
  id?: string;
  kind: OrderChargeKindDb;
  description: string;
  amount: number;
};

function newKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `ch-${Math.random().toString(36).slice(2)}`;
}

export function newChargeDraft(kind: OrderChargeKindDb = "shipping"): ChargeDraft {
  return { key: newKey(), kind, description: orderChargeKindLabels[kind], amount: "" };
}

function isDraftEmpty(d: ChargeDraft): boolean {
  return !d.amount.trim() && (!d.description.trim() || d.description === orderChargeKindLabels[d.kind]);
}

function parseAmount(d: ChargeDraft): number {
  return parseFloat(normalizeDecimalInput(d.amount));
}

/**
 * הסכום לפני מע״מ כפי שיישמר ב-DB (הנחה שלילית). זהה לחישוב בשרת:
 * כשהסכומים "כוללים מע״מ" — מחלקים ב-(1+מע״מ) ומעגלים לאגורות.
 */
export function chargeAmountExVat(
  d: Pick<ChargeDraft, "kind" | "amount">,
  vatIncluded: boolean,
  vatRate: number
): number | null {
  const a = parseFloat(normalizeDecimalInput(d.amount));
  if (Number.isNaN(a) || a <= 0) return null;
  const ex = roundMoney(vatIncluded ? a / (1 + vatRate) : a);
  return d.kind === "discount" ? -ex : ex;
}

/** שורות DB → טיוטות לטופס עריכה (סכום מוצג חיובי, כולל מע״מ אם צריך) */
export function chargeDraftsFromRows(
  rows: OrderChargeRow[],
  vatIncluded: boolean,
  vatRate: number
): ChargeDraft[] {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => {
      const abs = Math.abs(Number(r.amount));
      const shown = vatIncluded ? roundMoney(abs * (1 + vatRate)) : abs;
      return {
        key: r.id,
        id: r.id,
        kind: r.kind,
        description: r.description,
        amount: String(shown),
      };
    });
}

/** null = תקין. שורות ריקות לגמרי מתעלמים מהן. */
export function validateChargeDrafts(drafts: ChargeDraft[]): string | null {
  for (const [i, d] of drafts.entries()) {
    if (isDraftEmpty(d)) continue;
    const label = `חיוב ${i + 1}`;
    if (!d.description.trim()) return `${label}: חסר תיאור`;
    const a = parseAmount(d);
    if (!d.amount.trim() || Number.isNaN(a) || a <= 0) {
      return `${label}: סכום לא תקין (יש להזין מספר חיובי${
        d.kind === "discount" ? " — ההנחה תירשם כמינוס" : ""
      })`;
    }
  }
  return null;
}

export function chargePayloads(drafts: ChargeDraft[]): ChargePayload[] {
  return drafts
    .filter((d) => !isDraftEmpty(d))
    .map((d) => ({
      ...(d.id ? { id: d.id } : {}),
      kind: d.kind,
      description: d.description.trim(),
      amount: parseAmount(d),
    }));
}

/** סכום החיובים לפני מע״מ (לתצוגה המקדימה של הסכומים) */
export function chargesTotalExVat(
  drafts: ChargeDraft[],
  vatIncluded: boolean,
  vatRate: number
): number {
  return roundMoney(
    drafts.reduce((s, d) => s + (chargeAmountExVat(d, vatIncluded, vatRate) ?? 0), 0)
  );
}

export function OrderChargesEditor({
  charges,
  onChange,
  vatIncluded,
  vatRate,
  lockedReason,
}: {
  charges: ChargeDraft[];
  onChange: (next: ChargeDraft[]) => void;
  vatIncluded: boolean;
  vatRate: number;
  /** כשמוגדר — העריכה נעולה (למשל: כבר הופקה תעודת משלוח) */
  lockedReason?: string | null;
}) {
  const locked = !!lockedReason;

  function update(key: string, patch: Partial<ChargeDraft>) {
    onChange(
      charges.map((c) => {
        if (c.key !== key) return c;
        const next = { ...c, ...patch };
        // תיאור ברירת מחדל = שם הסוג, מתעדכן כל עוד המשתמש לא כתב משהו אחר
        if (
          patch.kind &&
          (!c.description.trim() || c.description === orderChargeKindLabels[c.kind])
        ) {
          next.description = orderChargeKindLabels[patch.kind];
        }
        return next;
      })
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-label="חיובים נוספים">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-foreground">חיובים נוספים</h3>
          <p className="text-muted-foreground text-xs">
            הובלה, עיבוד, שירות או הנחה. הנחה מזינים כמספר חיובי — היא תירשם
            כמינוס. {vatIncluded ? "הסכומים כוללים מע״מ (יומרו לנטו)." : "הסכומים לפני מע״מ."}
          </p>
        </div>
        {!locked ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...charges, newChargeDraft()])}
          >
            <Plus data-icon="inline-start" aria-hidden />
            חיוב נוסף
          </Button>
        ) : null}
      </div>

      {locked ? (
        <p className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          {lockedReason}
        </p>
      ) : null}

      {charges.length === 0 ? (
        locked ? null : (
          <p className="text-muted-foreground text-sm">אין חיובים נוספים.</p>
        )
      ) : (
        <div className="flex flex-col gap-2">
          {charges.map((c, i) => {
            const ex = chargeAmountExVat(c, vatIncluded, vatRate);
            return (
              <div
                key={c.key}
                className={cn(
                  "grid gap-2 rounded-md border border-border/60 bg-muted/10 p-2 sm:grid-cols-[9rem_minmax(0,1fr)_8rem_6.5rem_auto] sm:items-end",
                  locked && "opacity-70"
                )}
              >
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    סוג חיוב {i + 1}
                  </span>
                  <Select
                    dir="rtl"
                    value={c.kind}
                    disabled={locked}
                    onValueChange={(v) => update(c.key, { kind: v as OrderChargeKindDb })}
                  >
                    <SelectTrigger className="w-full" aria-label={`סוג חיוב ${i + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {orderChargeKindOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    תיאור חיוב {i + 1}
                  </span>
                  <Input
                    value={c.description}
                    disabled={locked}
                    onChange={(e) => update(c.key, { description: e.target.value })}
                    placeholder="למשל: הובלה לאתר בחיפה"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    סכום חיוב {i + 1}
                  </span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    value={c.amount}
                    disabled={locked}
                    onChange={(e) => update(c.key, { amount: e.target.value })}
                    placeholder="0"
                  />
                </label>
                <div
                  className={cn(
                    "px-1 pb-2 text-xs tabular-nums",
                    ex != null && ex < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                  )}
                  title="לפני מע״מ"
                >
                  {ex != null ? `${formatIls(ex)} נטו` : "—"}
                </div>
                {!locked ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-self-start"
                    aria-label={`הסרת חיוב ${i + 1}`}
                    onClick={() => onChange(charges.filter((x) => x.key !== c.key))}
                  >
                    <X aria-hidden />
                  </Button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
