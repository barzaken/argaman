"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GI_APP_TYPE_LABELS,
  GI_CARD_TYPE_LABELS,
  GI_DEAL_TYPE_LABELS,
  GI_OTHER_SUBTYPE_LABELS,
  GI_PAYMENT_TYPE_FIELDS,
  GI_PAYMENT_TYPE_LABELS,
  type GiPaymentType,
  type GiRowFieldDef,
} from "@/lib/green-invoice/document-types";
import type { DocPaymentRowModel } from "@/lib/green-invoice/document-builder";

import { DecimalInput, Field, OptionSelect, labelsToOptions } from "./form-bits";

const TYPE_OPTIONS = labelsToOptions(GI_PAYMENT_TYPE_LABELS);
const ENUMS: Record<string, { value: string; label: string }[]> = {
  cardType: labelsToOptions(GI_CARD_TYPE_LABELS),
  dealType: labelsToOptions(GI_DEAL_TYPE_LABELS),
  appType: labelsToOptions(GI_APP_TYPE_LABELS),
  subType: labelsToOptions(GI_OTHER_SUBTYPE_LABELS),
};

/** שדות שנמחקים כשמחליפים אמצעי תשלום */
const TYPE_SPECIFIC_KEYS: (keyof DocPaymentRowModel)[] = [
  "chequeNum",
  "bankName",
  "bankBranch",
  "bankAccount",
  "cardType",
  "cardNum",
  "dealType",
  "numPayments",
  "firstPayment",
  "accountId",
  "transactionId",
  "appType",
  "subType",
];

export function emptyPaymentRow(today: string): DocPaymentRowModel {
  return { type: 4, date: today, price: "" };
}

function SpecificField({
  def,
  row,
  n,
  error,
  onChange,
}: {
  def: GiRowFieldDef;
  row: DocPaymentRowModel;
  n: number;
  error?: string;
  onChange: (v: string) => void;
}) {
  const key = def.key as keyof DocPaymentRowModel;
  const value = row[key] === undefined || row[key] === null ? "" : String(row[key]);
  const label = `${def.label}${def.required ? "" : " (רשות)"} — תקבול ${n}`;
  if (def.kind === "enum") {
    return (
      <Field label={label} error={error}>
        <OptionSelect value={value} onChange={onChange} options={ENUMS[def.key] ?? []} ariaLabel={label} invalid={!!error} />
      </Field>
    );
  }
  if (def.kind === "number" || def.kind === "integer") {
    return (
      <Field label={label} error={error}>
        <DecimalInput value={value} onChange={onChange} invalid={!!error} />
      </Field>
    );
  }
  return (
    <Field label={label} error={error}>
      <Input
        dir="ltr"
        className="text-start"
        value={value}
        inputMode={def.key === "cardNum" ? "numeric" : undefined}
        maxLength={def.key === "cardNum" ? 4 : undefined}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error || undefined}
      />
    </Field>
  );
}

/**
 * עורך שורות תקבול (PaymentRowRequest) — שדות לפי אמצעי התשלום:
 * צ׳ק (מספר, בנק, סניף, חשבון — חובה), אשראי (סוג כרטיס, 4 ספרות, סוג עסקה, תשלומים),
 * העברה (בנק/סניף/חשבון — רשות), פייפאל / אפליקציה / אחר (חשבון, מזהה עסקה, אפליקציה / סוג).
 */
export function PaymentRowsEditor({
  rows,
  onChange,
  today,
  errors,
}: {
  rows: DocPaymentRowModel[];
  onChange: (rows: DocPaymentRowModel[]) => void;
  today: string;
  errors: Record<string, string>;
}) {
  function update(i: number, patch: Partial<DocPaymentRowModel>) {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function changeType(i: number, type: GiPaymentType) {
    const keep = new Set(GI_PAYMENT_TYPE_FIELDS[type].map((f) => f.key));
    const next: DocPaymentRowModel = { ...rows[i], type };
    for (const k of TYPE_SPECIFIC_KEYS) if (!keep.has(k)) delete next[k];
    if (type === 3) {
      next.cardType ??= 0;
      next.dealType ??= 1;
      next.numPayments ??= 1;
    }
    onChange(rows.map((r, j) => (j === i ? next : r)));
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">אין שורות תקבול</p>
      ) : null}
      {rows.map((row, i) => {
        const n = i + 1;
        const e = (k: string) => errors[`payment.${i}.${k}`];
        const specific = GI_PAYMENT_TYPE_FIELDS[row.type] ?? [];
        return (
          <div key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-sm" data-payment-row={n}>
            <div className="grid gap-3 md:grid-cols-[12rem_10rem_10rem_minmax(0,1fr)]">
              <Field label={`אמצעי תשלום — תקבול ${n}`} error={e("type")}>
                <OptionSelect
                  value={String(row.type)}
                  onChange={(v) => changeType(i, Number(v) as GiPaymentType)}
                  options={TYPE_OPTIONS}
                  ariaLabel={`אמצעי תשלום — תקבול ${n}`}
                />
              </Field>
              <Field label={`תאריך — תקבול ${n}`} error={e("date")}>
                <Input
                  type="date"
                  dir="ltr"
                  className="text-start"
                  max={today}
                  value={row.date}
                  onChange={(ev) => update(i, { date: ev.target.value })}
                  aria-invalid={!!e("date") || undefined}
                />
              </Field>
              <Field label={`סכום — תקבול ${n}`} error={e("price")}>
                <DecimalInput value={row.price} onChange={(v) => update(i, { price: v })} invalid={!!e("price")} />
              </Field>
              <div className="flex items-end justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-destructive hover:text-destructive"
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
                  aria-label={`הסרת תקבול ${n}`}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  הסרה
                </Button>
              </div>
            </div>
            {specific.length ? (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                {specific.map((f) => (
                  <SpecificField
                    key={f.key}
                    def={f}
                    row={row}
                    n={n}
                    error={e(f.key)}
                    onChange={(v) => update(i, { [f.key]: v } as Partial<DocPaymentRowModel>)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      <div>
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => onChange([...rows, emptyPaymentRow(today)])}>
          <Plus className="size-3.5" aria-hidden />
          הוספת תקבול
        </Button>
      </div>
    </div>
  );
}
