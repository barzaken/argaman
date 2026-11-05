"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PickerCustomer = { id: string; name: string; tax_id: string };

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * בחירת לקוח עם חיפוש לפי שם או ח.פ. הקלדת ח.פ מלא ומדויק בוחרת את הלקוח
 * אוטומטית (נוח לסוכן שקורא ח.פ מצילום קבלה / צ׳ק).
 */
export function CustomerPicker({
  customers,
  value,
  onChange,
  disabled,
  error,
}: {
  customers: PickerCustomer[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const [query, setQuery] = useState("");
  const selected = customers.find((c) => c.id === value);

  if (selected) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">לקוח</span>
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
          aria-label="לקוח נבחר"
        >
          <div className="min-w-0">
            <p className="font-medium text-foreground">{selected.name}</p>
            <p className="text-muted-foreground text-xs tabular-nums">
              ח.פ / ת״ז: {selected.tax_id}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setQuery("");
              onChange("");
            }}
          >
            <X data-icon="inline-start" />
            החלפת לקוח
          </Button>
        </div>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const qDigits = digits(query);
  const matches = q
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (qDigits.length >= 2 && digits(c.tax_id).includes(qDigits))
      )
    : customers;

  function handleQuery(next: string) {
    setQuery(next);
    const nd = digits(next);
    if (nd.length >= 5) {
      const exact = customers.filter((c) => digits(c.tax_id) === nd);
      if (exact.length === 1) onChange(exact[0].id);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          לקוח — חיפוש לפי שם או ח.פ
        </span>
        <div className="relative">
          <Search
            className="pointer-events-none absolute inset-y-0 start-2.5 my-auto size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => handleQuery(e.target.value)}
            placeholder="הקלידו שם לקוח או ח.פ / ת״ז"
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            className="ps-8"
            autoComplete="off"
          />
        </div>
      </label>
      <ul
        className="flex max-h-56 flex-col gap-1 overflow-auto rounded-lg border border-border bg-card p-1"
        role="listbox"
        aria-label="תוצאות חיפוש לקוח"
      >
        {matches.slice(0, 30).map((c) => (
          <li key={c.id}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              disabled={disabled}
              onClick={() => onChange(c.id)}
              className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-start text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                ח.פ {c.tax_id}
              </span>
            </button>
          </li>
        ))}
        {matches.length === 0 ? (
          <li className="px-2.5 py-3 text-center text-muted-foreground text-sm">
            לא נמצא לקוח בשם או ח.פ הזה.
          </li>
        ) : null}
      </ul>
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
