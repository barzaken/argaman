"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

import {
  deleteCustomerStonePrice,
  upsertCustomerStonePrice,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorDialog } from "@/components/error-dialog";
import type { CustomerStonePriceRow } from "@/lib/db/types";
import type { StoneRow } from "@/lib/db/types";
import { formatIlsDense } from "@/lib/db/format";
import { cn } from "@/lib/utils";

const rowClass =
  "flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-3 shadow-sm";

export function CustomerPriceOverrides({
  customerId,
  overrides,
  stoneOptions,
}: {
  customerId: string;
  overrides: (CustomerStonePriceRow & {
    label: string;
  })[];
  stoneOptions: Pick<StoneRow, "id" | "name" | "polish_type">[];
}) {
  const router = useRouter();
  const [stoneId, setStoneId] = useState("");
  const [pricePerM3, setPricePerM3] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!stoneId || !pricePerM3.trim()) return;
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("customer_id", customerId);
    fd.set("stone_id", stoneId);
    fd.set("price_per_m3", pricePerM3.replace(",", "."));
    const res = await upsertCustomerStonePrice(fd);
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setStoneId("");
    setPricePerM3("");
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-col gap-3 p-4">
        {overrides.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            אין מחירים מיוחדים — הוסיפו בהוספת מחיר למטה
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {overrides.map((o) => (
              <li key={o.id}>
                <div
                  className={cn(
                    rowClass,
                    "transition-colors hover:bg-muted/30 hover:border-muted-foreground/25"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {o.label}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                      {formatIlsDense(Number(o.price_per_m3))} לקו״ב
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                    title="הסרה"
                    onClick={async () => {
                      const res = await deleteCustomerStonePrice(
                        customerId,
                        o.id
                      );
                      if (!res.ok) setDialogError(res.message);
                      else router.refresh();
                    }}
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">הסרת מחיר</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border px-4 py-4">
        <p className="text-muted-foreground mb-3 text-xs">הוספת מחיר</p>
        <form onSubmit={handleAdd} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">מוצר בקטלוג</span>
            <Select
              dir="rtl"
              value={stoneId || undefined}
              onValueChange={setStoneId}
            >
              <SelectTrigger>
                <SelectValue placeholder="בחר אבן" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {stoneOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {s.polish_type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">
              מחיר קו״ב ללקוח (₪)
            </span>
            <Input
              dir="ltr"
              inputMode="decimal"
              required
              className="font-medium tabular-nums"
              value={pricePerM3}
              onChange={(e) => setPricePerM3(e.target.value)}
            />
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            size="sm"
            className="w-fit"
            disabled={
              pending ||
              !stoneId ||
              !pricePerM3.trim() ||
              Number.isNaN(parseFloat(pricePerM3.replace(",", "."))) ||
              parseFloat(pricePerM3.replace(",", ".")) <= 0
            }
          >
            {pending ? "שומר…" : "שמירת מחיר"}
          </Button>
        </form>
      </div>

      <ErrorDialog
        message={dialogError}
        onClose={() => setDialogError(null)}
      />
    </>
  );
}
