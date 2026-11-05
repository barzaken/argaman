"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { activityTableLabels } from "@/lib/db/labels";
import { cn } from "@/lib/utils";

const ALL = "__all__";

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
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

export function ActivityFilters({
  table,
  user,
  from,
  to,
  users,
}: {
  table: string | null;
  user: string | null;
  from: string;
  to: string;
  users: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function apply(patch: Record<string, string | null>) {
    const next = new URLSearchParams();
    const merged = { table, user, from, to, ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (v) next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  const hasFilters = !!(table || user || from || to);

  return (
    <div
      className={cn(
        "grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end",
        pending && "opacity-70"
      )}
      aria-busy={pending}
    >
      <Field label="טבלה">
        <Select
          dir="rtl"
          value={table ?? ALL}
          onValueChange={(v) => apply({ table: v === ALL ? null : v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value={ALL}>כל הטבלאות</SelectItem>
            {Object.entries(activityTableLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="משתמש">
        <Select
          dir="rtl"
          value={user ?? ALL}
          onValueChange={(v) => apply({ user: v === ALL ? null : v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value={ALL}>כל המשתמשים</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.value} value={u.value}>
                <span dir="ltr">{u.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="מתאריך">
        <Input
          type="date"
          dir="ltr"
          value={from}
          onChange={(e) => apply({ from: e.target.value || null })}
        />
      </Field>
      <Field label="עד תאריך">
        <Input
          type="date"
          dir="ltr"
          value={to}
          onChange={(e) => apply({ to: e.target.value || null })}
        />
      </Field>
      <Button
        type="button"
        variant="ghost"
        disabled={!hasFilters}
        onClick={() => apply({ table: null, user: null, from: null, to: null })}
      >
        <X data-icon="inline-start" aria-hidden />
        ניקוי
      </Button>
    </div>
  );
}
