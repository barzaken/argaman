"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type EntityOption = { id: string; name: string; tax_id: string | null };

/**
 * בחירה עם חיפוש (לקוח / ספק): מקלידים שם או ח.פ, בוחרים מהרשימה.
 * הערך הנבחר נשלח כ-hidden input בשם `name`.
 */
export function EntityPicker({
  label,
  name,
  options,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  options: EntityOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  hint?: React.ReactNode;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = value ? options.find((o) => o.id === value) ?? null : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter(
          (o) =>
            o.name.toLowerCase().includes(q) ||
            (o.tax_id ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "\u0000")
        )
      : options;
    return list.slice(0, 50);
  }, [options, query]);

  function pick(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input type="hidden" name={name} value={value ?? ""} />
      {selected ? (
        <>
          <span className="text-sm font-medium text-foreground">{label}</span>
          <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-muted/30 px-3 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-medium">{selected.name}</span>
              {selected.tax_id ? (
                <span className="text-muted-foreground tabular-nums"> · ח.פ {selected.tax_id}</span>
              ) : null}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1 px-2 text-xs"
              onClick={() => onChange(null)}
              aria-label={`הסרת ${label}`}
            >
              <X className="size-3.5" aria-hidden />
              הסרה
            </Button>
          </div>
        </>
      ) : (
        <label className="relative flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <Input
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            value={query}
            placeholder={placeholder ?? "חיפוש לפי שם או ח.פ…"}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 150);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (filtered[0]) pick(filtered[0].id);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          {open ? (
            <ul
              id={listId}
              role="listbox"
              aria-label={label}
              className="bg-popover text-popover-foreground absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-md border p-1 shadow-md"
              onMouseDown={(e) => {
                // שומר על הפוקוס כדי שהרשימה לא תיסגר לפני הלחיצה
                e.preventDefault();
                if (blurTimer.current) clearTimeout(blurTimer.current);
              }}
            >
              {filtered.length === 0 ? (
                <li className="text-muted-foreground px-2 py-1.5 text-sm">לא נמצאו תוצאות</li>
              ) : (
                filtered.map((o) => (
                  <li
                    key={o.id}
                    role="option"
                    aria-selected={false}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm",
                      "hover:bg-accent hover:text-accent-foreground"
                    )}
                    onClick={() => pick(o.id)}
                  >
                    <span className="truncate">{o.name}</span>
                    {o.tax_id ? (
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {o.tax_id}
                      </span>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </label>
      )}
      {hint ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
          <Check className="size-3.5 shrink-0" aria-hidden />
          {hint}
        </p>
      ) : null}
    </div>
  );
}
