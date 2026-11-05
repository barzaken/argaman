"use client";

import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeDecimalInput } from "@/lib/db/calculations";
import { formatIlsDense } from "@/lib/db/format";
import { cn } from "@/lib/utils";

/**
 * שדה: <label> שעוטף את הקלט (כמו בשאר הטפסים — כך הסוכן מאתר שדה לפי הכותרת),
 * עם הודעת שגיאה מתחת.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

export function SectionTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-2">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle ? <p className="text-muted-foreground text-xs">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** נרמול קלט מספרי (כולל מינוס לשורת הנחה) */
export function normalizeSignedDecimal(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const neg = /^[-−]/.test(s);
  const n = normalizeDecimalInput(neg ? s.slice(1) : s);
  if (n === "" || n === "NaN") return n === "" ? "" : raw;
  return neg ? `-${n}` : n;
}

/** קלט מספרי: type=text + inputMode=decimal, מנורמל ביציאה מהשדה */
export function DecimalInput({
  value,
  onChange,
  allowNegative,
  className,
  invalid,
  ...rest
}: {
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  allowNegative?: boolean;
  invalid?: boolean;
  className?: string;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type">) {
  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      dir="ltr"
      aria-invalid={invalid || undefined}
      className={cn("text-start tabular-nums", className)}
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        const raw = e.target.value;
        const n = allowNegative ? normalizeSignedDecimal(raw) : normalizeDecimalInput(raw);
        if (n !== "NaN" && n !== raw) onChange(n);
      }}
    />
  );
}

/** Select עם אפשרויות {value,label} — ערכים מספריים כמחרוזת */
export function OptionSelect({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder,
  className,
  invalid,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn("w-full", className)} aria-label={ariaLabel} aria-invalid={invalid || undefined}>
        <SelectValue placeholder={placeholder ?? "בחירה"} />
      </SelectTrigger>
      <SelectContent dir="rtl">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function labelsToOptions(labels: Record<number | string, string>): { value: string; label: string }[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

/** סכום במטבע המסמך */
export function formatMoney(n: number, currency: string): string {
  if (currency === "ILS") return formatIlsDense(n);
  return `‎${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}
