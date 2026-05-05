"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  deleteCustomerInventoryPrice,
  upsertCustomerInventoryPrice,
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
import type { CustomerInventoryPriceRow } from "@/lib/db/types";
import type { InventoryItemViewRow } from "@/lib/db/types";

export function CustomerPriceOverrides({
  customerId,
  overrides,
  inventoryOptions,
}: {
  customerId: string;
  overrides: (CustomerInventoryPriceRow & {
    label: string;
  })[];
  inventoryOptions: Pick<
    InventoryItemViewRow,
    "id" | "stone_name" | "polish_type"
  >[];
}) {
  const router = useRouter();
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [pricePerM3, setPricePerM3] = useState("");
  const [customerPrice, setCustomerPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!inventoryItemId) return;
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("customer_id", customerId);
    fd.set("inventory_item_id", inventoryItemId);
    if (pricePerM3.trim()) fd.set("price_per_m3", pricePerM3.replace(",", "."));
    if (customerPrice.trim())
      fd.set("customer_price", customerPrice.replace(",", "."));
    const res = await upsertCustomerInventoryPrice(fd);
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setInventoryItemId("");
    setPricePerM3("");
    setCustomerPrice("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <h3 className="font-semibold text-card-foreground">מחירים ללקוח</h3>
      <ul className="flex flex-col gap-2">
        {overrides.map((o) => (
          <li
            key={o.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm last:border-b-0"
          >
            <span className="min-w-0 flex-1">{o.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {o.price_per_m3 != null ? `לקו״ב: ${o.price_per_m3}` : ""}{" "}
              {o.customer_price != null ? `| ללקוח: ${o.customer_price}` : ""}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                const res = await deleteCustomerInventoryPrice(customerId, o.id);
                if (!res.ok) setDialogError(res.message);
                else router.refresh();
              }}
            >
              הסרה
            </Button>
          </li>
        ))}
        {overrides.length === 0 ? (
          <li className="text-muted-foreground text-sm">אין מחירים מיוחדים</li>
        ) : null}
      </ul>
      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-3 border-t border-border pt-4"
      >
        <p className="text-muted-foreground text-xs">הוספת מחיר לפי משלוח במלאי</p>
        <Select
          dir="rtl"
          value={inventoryItemId || undefined}
          onValueChange={setInventoryItemId}
        >
          <SelectTrigger>
            <SelectValue placeholder="בחר משלוח מלאי" />
          </SelectTrigger>
          <SelectContent dir="rtl">
            {inventoryOptions.map((inv) => (
              <SelectItem key={inv.id} value={inv.id}>
                {inv.stone_name} · {inv.polish_type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            dir="ltr"
            placeholder="מחיר לקו״ב"
            inputMode="decimal"
            value={pricePerM3}
            onChange={(e) => setPricePerM3(e.target.value)}
          />
          <Input
            dir="ltr"
            placeholder="מחיר ללקוח"
            inputMode="decimal"
            value={customerPrice}
            onChange={(e) => setCustomerPrice(e.target.value)}
          />
        </div>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending || !inventoryItemId}>
          {pending ? "שומר…" : "הוספת מחיר"}
        </Button>
      </form>
      <ErrorDialog
        message={dialogError}
        onClose={() => setDialogError(null)}
      />
    </div>
  );
}
