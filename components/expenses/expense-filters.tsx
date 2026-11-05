"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { expenseCategoryOptions } from "@/lib/db/labels";
import { formatMonth } from "./expense-utils";

const ALL = "all";

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-[10rem] flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

/** מסנני רשימת ההוצאות — נשמרים בכתובת (?month=&category=&paid=) */
export function ExpenseFilters({
  month,
  category,
  paid,
  monthOptions,
  defaultMonth,
}: {
  month: string;
  category: string;
  paid: string;
  monthOptions: string[];
  defaultMonth: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function apply(next: { month?: string; category?: string; paid?: string }) {
    const m = next.month ?? month;
    const c = next.category ?? category;
    const p = next.paid ?? paid;
    const sp = new URLSearchParams();
    if (m !== defaultMonth) sp.set("month", m);
    if (c !== ALL) sp.set("category", c);
    if (p !== ALL) sp.set("paid", p);
    const qs = sp.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  const dirty = month !== defaultMonth || category !== ALL || paid !== ALL;

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={isPending}>
      <FilterField label="חודש דיווח">
        <Select dir="rtl" value={month} onValueChange={(v) => apply({ month: v })}>
          <SelectTrigger className="w-full" aria-label="חודש דיווח">
            <SelectValue />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value={ALL}>כל החודשים</SelectItem>
            {monthOptions.map((m) => (
              <SelectItem key={m} value={m}>
                {formatMonth(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>
      <FilterField label="קטגוריה">
        <Select dir="rtl" value={category} onValueChange={(v) => apply({ category: v })}>
          <SelectTrigger className="w-full" aria-label="קטגוריה">
            <SelectValue />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value={ALL}>כל הקטגוריות</SelectItem>
            {expenseCategoryOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>
      <FilterField label="סטטוס תשלום">
        <Select dir="rtl" value={paid} onValueChange={(v) => apply({ paid: v })}>
          <SelectTrigger className="w-full" aria-label="סטטוס תשלום">
            <SelectValue />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value={ALL}>הכל</SelectItem>
            <SelectItem value="paid">שולם</SelectItem>
            <SelectItem value="unpaid">לא שולם</SelectItem>
          </SelectContent>
        </Select>
      </FilterField>
      {dirty ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => startTransition(() => router.replace(pathname))}
        >
          איפוס מסננים
        </Button>
      ) : null}
    </div>
  );
}
