"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { createSupplier } from "@/app/dashboard/suppliers/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { actionCrashed } from "@/lib/action-client";
import { cn } from "@/lib/utils";

export type SupplierOption = {
  id: string;
  name: string;
  tax_id: string | null;
  is_active: boolean;
};

const NONE = "__none__";

function normalizeTaxId(s: string) {
  return s.replace(/[\s-]/g, "").toUpperCase();
}

/** ספק לפי ח.פ (למשל מהמסמך) — לבחירה התחלתית בטופס */
export function matchSupplierByTaxId(
  suppliers: SupplierOption[],
  taxId: string | null | undefined
): SupplierOption | null {
  if (!taxId) return null;
  const t = normalizeTaxId(taxId);
  return suppliers.find((s) => s.tax_id === t) ?? null;
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
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

/**
 * בחירת ספק: חיפוש לפי שם או ח.פ (ח.פ מלא בוחר אוטומטית), רשימה נפתחת,
 * ו"ספק חדש" — טופס קצר שיוצר ספק בלי לצאת מהטופס. ח.פ כפול נחסם עם קישור לספק הקיים.
 */
export function SupplierPicker({
  suppliers: initialSuppliers,
  value,
  onChange,
  label = "ספק",
  allowNone = true,
  noneLabel = "ללא ספק",
  initialSearch = "",
  newSupplierDefaults,
  compact = false,
}: {
  suppliers: SupplierOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  allowNone?: boolean;
  noneLabel?: string;
  /** למשל ח.פ מהמסמך — אם תואם ספק קיים הוא ייבחר */
  initialSearch?: string;
  /** ערכי ברירת מחדל לטופס "ספק חדש" (למשל שם וח.פ מהמסמך) */
  newSupplierDefaults?: { name?: string | null; tax_id?: string | null };
  /** עמודה צרה — השדות אחד מתחת לשני */
  compact?: boolean;
}) {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>(initialSuppliers);
  const [search, setSearch] = useState(initialSearch);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState(newSupplierDefaults?.name ?? "");
  const [newTaxId, setNewTaxId] = useState(newSupplierDefaults?.tax_id ?? "");
  const [newPhone, setNewPhone] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: string; name: string } | null>(null);
  const [savingNew, setSavingNew] = useState(false);

  const selected = suppliers.find((s) => s.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qTax = normalizeTaxId(search);
    const list = suppliers.filter((s) => s.is_active || s.id === value);
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (qTax.length > 0 && (s.tax_id ?? "").includes(qTax))
    );
  }, [suppliers, search, value]);

  /** ח.פ מלא שתואם ספק אחד בדיוק */
  const taxMatch = useMemo(() => {
    const qTax = normalizeTaxId(search);
    if (qTax.length < 5) return null;
    return suppliers.find((s) => s.tax_id === qTax) ?? null;
  }, [suppliers, search]);

  function handleSearchChange(next: string) {
    setSearch(next);
    const qTax = normalizeTaxId(next);
    if (qTax.length >= 5) {
      const hit = suppliers.find((s) => s.tax_id === qTax);
      if (hit && hit.id !== value) onChange(hit.id);
    }
  }

  async function handleCreate() {
    setCreateError(null);
    setExisting(null);
    if (!newName.trim()) {
      setCreateError("יש למלא שם ספק");
      return;
    }
    setSavingNew(true);
    const res = await createSupplier({
      name: newName,
      tax_id: newTaxId,
      phone: newPhone,
    }).catch(actionCrashed);
    setSavingNew(false);
    if (!res.ok) {
      setCreateError(res.message);
      if ("existing" in res && res.existing) setExisting(res.existing);
      return;
    }
    const created: SupplierOption = {
      id: res.id,
      name: newName.trim(),
      tax_id: newTaxId ? normalizeTaxId(newTaxId) : null,
      is_active: true,
    };
    setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "he")));
    onChange(res.id);
    setSearch("");
    setCreating(false);
    setNewName("");
    setNewTaxId("");
    setNewPhone("");
    toast.success(`הספק "${created.name}" נוסף ונבחר`);
  }

  function chooseExisting() {
    if (!existing) return;
    if (!suppliers.some((s) => s.id === existing.id)) {
      setSuppliers((prev) => [
        ...prev,
        { id: existing.id, name: existing.name, tax_id: null, is_active: true },
      ]);
    }
    onChange(existing.id);
    setCreating(false);
    setCreateError(null);
    setExisting(null);
    toast.success(`נבחר הספק הקיים "${existing.name}"`);
  }

  const items = selected && !filtered.some((s) => s.id === selected.id)
    ? [selected, ...filtered]
    : filtered;

  return (
    <div className="flex flex-col gap-3">
      <div className={cn("grid w-full gap-4", !compact && "sm:grid-cols-2")}>
        <Field label="חיפוש ספק (שם או ח.פ)">
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder="למשל 515100001"
            autoComplete="off"
          />
        </Field>
        <Field label={label}>
          <Select
            dir="rtl"
            value={value ?? (allowNone ? NONE : undefined)}
            onValueChange={(v) => {
              // Radix שולח "" כשהערך עוד לא נרשם ברשימה (למשל ספק שנוצר הרגע) — מתעלמים
              if (!v) return;
              onChange(v === NONE ? null : v);
            }}
          >
            <SelectTrigger className="w-full" aria-label={label}>
              <SelectValue placeholder="בחרו ספק מהרשימה" />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {allowNone ? <SelectItem value={NONE}>{noneLabel}</SelectItem> : null}
              {items.map((s) => (
                <SelectItem key={s.id} value={s.id} textValue={s.name}>
                  <span className="truncate">{s.name}</span>
                  {s.tax_id ? (
                    <span className="text-muted-foreground ms-1 text-xs tabular-nums" dir="ltr">
                      {s.tax_id}
                    </span>
                  ) : null}
                </SelectItem>
              ))}
              {items.length === 0 ? (
                <p className="text-muted-foreground px-2 py-3 text-sm">
                  לא נמצא ספק — אפשר להוסיף ״ספק חדש״
                </p>
              ) : null}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {search.trim() ? (
          taxMatch ? (
            <span className="text-emerald-700 dark:text-emerald-400">
              נמצא ספק לפי ח.פ: {taxMatch.name}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {filtered.length === 0
                ? "לא נמצא ספק תואם."
                : `${filtered.length} ספקים תואמים ברשימה.`}
            </span>
          )
        ) : null}
        {selected ? (
          <Link
            href={`/dashboard/suppliers/${selected.id}`}
            className="text-muted-foreground underline-offset-4 hover:underline"
            target="_blank"
          >
            כרטיס הספק
          </Link>
        ) : null}
        {!creating ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ms-auto gap-1"
            onClick={() => {
              setCreating(true);
              if (!newTaxId && /^\d{5,}$/.test(normalizeTaxId(search)) && !taxMatch) {
                setNewTaxId(normalizeTaxId(search));
              }
            }}
          >
            <Plus className="size-3.5" aria-hidden />
            ספק חדש
          </Button>
        ) : null}
      </div>

      {creating ? (
        <div
          className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-3"
          role="group"
          aria-label="ספק חדש"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleCreate();
            }
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">ספק חדש</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="סגירת טופס ספק חדש"
              onClick={() => {
                setCreating(false);
                setCreateError(null);
                setExisting(null);
              }}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          <div className={cn("grid gap-3", !compact && "sm:grid-cols-3")}>
            <Field label="שם הספק החדש">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
            <Field label="ח.פ / ע.מ של הספק החדש">
              <Input
                dir="ltr"
                className="text-start"
                inputMode="numeric"
                value={newTaxId}
                onChange={(e) => setNewTaxId(e.target.value)}
              />
            </Field>
            <Field label="טלפון הספק החדש">
              <Input
                dir="ltr"
                className="text-start"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
            </Field>
          </div>
          {createError ? (
            <div className="flex flex-wrap items-center gap-2 text-sm" role="alert">
              <span className="text-destructive">{createError}</span>
              {existing ? (
                <>
                  <Button type="button" size="sm" variant="secondary" onClick={chooseExisting}>
                    בחירת הספק הקיים
                  </Button>
                  <Link
                    href={`/dashboard/suppliers/${existing.id}`}
                    className="underline underline-offset-4"
                    target="_blank"
                  >
                    לכרטיס הספק הקיים
                  </Link>
                </>
              ) : null}
            </div>
          ) : null}
          <div>
            <Button
              type="button"
              size="sm"
              disabled={savingNew}
              onClick={() => void handleCreate()}
            >
              {savingNew ? "שומר ספק…" : "שמירת ספק חדש"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
