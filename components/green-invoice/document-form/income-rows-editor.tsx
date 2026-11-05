"use client";

import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GI_ROW_VAT_TYPE_LABELS, type GiRowVatType } from "@/lib/green-invoice/document-types";
import { rowLineTotal, type DocIncomeRowModel } from "@/lib/green-invoice/document-builder";

import { DecimalInput, Field, OptionSelect, formatMoney, labelsToOptions } from "./form-bits";

const VAT_OPTIONS = labelsToOptions(GI_ROW_VAT_TYPE_LABELS);

export function emptyIncomeRow(): DocIncomeRowModel {
  return { description: "", quantity: 1, price: "", vatType: 0 };
}

/**
 * עורך שורות הכנסה (IncomeRowRequest): תיאור, כמות, מחיר, מע״מ בשורה,
 * ובפרטים נוספים — מק״ט, שיעור מע״מ, מזהה פריט ב-Morning.
 */
export function IncomeRowsEditor({
  rows,
  onChange,
  currency,
  docExempt,
  errors,
}: {
  rows: DocIncomeRowModel[];
  onChange: (rows: DocIncomeRowModel[]) => void;
  currency: string;
  /** מסמך פטור — אין בחירת מע״מ בשורה */
  docExempt: boolean;
  errors: Record<string, string>;
}) {
  const [open, setOpen] = useState<Record<number, boolean>>({});

  function update(i: number, patch: Partial<DocIncomeRowModel>) {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          אין שורות הכנסה
        </p>
      ) : null}
      {rows.map((row, i) => {
        const n = i + 1;
        const e = (k: string) => errors[`income.${i}.${k}`];
        const more = open[i] || !!(row.catalogNum || row.itemId || (row.vatRate !== undefined && row.vatRate !== ""));
        return (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-sm"
            data-income-row={n}
          >
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_7rem_9rem_12rem]">
              <Field label={`תיאור שורה ${n}`} error={e("description")}>
                <Input
                  value={row.description}
                  onChange={(ev) => update(i, { description: ev.target.value })}
                  aria-invalid={!!e("description") || undefined}
                  placeholder="פריט / שירות"
                />
              </Field>
              <Field label={`כמות שורה ${n}`} error={e("quantity")}>
                <DecimalInput value={row.quantity} onChange={(v) => update(i, { quantity: v })} invalid={!!e("quantity")} />
              </Field>
              <Field label={`מחיר ליחידה שורה ${n}`} error={e("price")}>
                <DecimalInput
                  value={row.price}
                  onChange={(v) => update(i, { price: v })}
                  allowNegative
                  invalid={!!e("price")}
                />
              </Field>
              {docExempt ? (
                <Field label={`מע״מ שורה ${n}`}>
                  <span className="flex h-8 items-center text-sm text-muted-foreground">פטור (המסמך פטור)</span>
                </Field>
              ) : (
                <Field label={`מע״מ שורה ${n}`} error={e("vatType")}>
                  <OptionSelect
                    value={String(row.vatType)}
                    onChange={(v) => update(i, { vatType: Number(v) as GiRowVatType })}
                    options={VAT_OPTIONS}
                    ariaLabel={`מע״מ שורה ${n}`}
                    invalid={!!e("vatType")}
                  />
                </Field>
              )}
            </div>
            {more ? (
              <div className="grid gap-3 md:grid-cols-3">
                <Field label={`מק״ט שורה ${n}`}>
                  <Input dir="ltr" className="text-start" value={row.catalogNum ?? ""} onChange={(ev) => update(i, { catalogNum: ev.target.value })} />
                </Field>
                <Field label={`שיעור מע״מ שורה ${n}`} hint="ריק = ברירת המחדל של העסק; למשל 0.18" error={e("vatRate")}>
                  <DecimalInput value={row.vatRate ?? ""} onChange={(v) => update(i, { vatRate: v })} invalid={!!e("vatRate")} />
                </Field>
                <Field label={`מזהה פריט ב-Morning שורה ${n}`}>
                  <Input dir="ltr" className="text-start" value={row.itemId ?? ""} onChange={(ev) => update(i, { itemId: ev.target.value })} />
                </Field>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
                onClick={() => setOpen((o) => ({ ...o, [i]: !more }))}
                aria-expanded={more}
              >
                <ChevronDown className={cn("size-3.5 transition-transform", more && "rotate-180")} aria-hidden />
                פרטים נוספים
              </Button>
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-muted-foreground">
                  סה״כ שורה: <span className="font-medium text-foreground">{formatMoney(rowLineTotal(row), currency)}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-destructive hover:text-destructive"
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
                  aria-label={`הסרת שורה ${n}`}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  הסרה
                </Button>
              </div>
            </div>
          </div>
        );
      })}
      <div>
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => onChange([...rows, emptyIncomeRow()])}>
          <Plus className="size-3.5" aria-hidden />
          הוספת שורת הכנסה
        </Button>
      </div>
    </div>
  );
}
