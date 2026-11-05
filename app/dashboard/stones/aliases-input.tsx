"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/** מנקה ומאחד רשימת שמות חלופיים (בלי כפילויות, בלי רווחים מיותרים) */
export function normalizeAliases(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = raw.replace(/\s+/g, " ").trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/**
 * שדה "צ׳יפים" לשמות חלופיים: מקלידים ולוחצים Enter (או פסיק) כדי להוסיף,
 * × כדי להסיר, Backspace בשדה ריק מסיר את האחרון. טקסט שנשאר בשדה נוסף
 * אוטומטית כשיוצאים מהשדה — כדי שלא ילך לאיבוד בשמירה.
 */
export function AliasesInput({
  label,
  value,
  onChange,
  placeholder = "הקלידו שם ולחצו Enter",
  hint,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: string;
}) {
  const [draft, setDraft] = useState("");
  const inputId = useId();

  function commit(text: string) {
    const parts = text.split(/[,\n]/);
    const next = normalizeAliases([...value, ...parts]);
    if (next.length !== value.length) onChange(next);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* הכפתורים (×) לא בתוך ה-label — אחרת התווית "נצמדת" לכפתור הראשון ולא לשדה */}
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div
          onClick={(e) => {
            if (e.target === e.currentTarget) document.getElementById(inputId)?.focus();
          }}
          className={cn(
            "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-xs transition-colors",
            "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30"
          )}
        >
          {value.map((alias) => (
            <span
              key={alias}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground"
            >
              <span className="truncate">{alias}</span>
              <button
                type="button"
                className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`הסרת ${alias}`}
                onClick={(e) => {
                  e.preventDefault();
                  onChange(value.filter((a) => a !== alias));
                }}
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
          <input
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
                e.preventDefault();
                commit(draft);
                return;
              }
              if (e.key === "Enter") {
                // Enter בשדה ריק לא שולח את הטופס בטעות
                e.preventDefault();
                return;
              }
              if (e.key === "Backspace" && !draft && value.length > 0) {
                onChange(value.slice(0, -1));
              }
            }}
            onBlur={() => {
              if (draft.trim()) commit(draft);
            }}
            placeholder={value.length === 0 ? placeholder : ""}
            className="min-w-[8rem] flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground"
          />
      </div>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}
