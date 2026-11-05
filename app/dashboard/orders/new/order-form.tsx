"use client";

import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";

import { toast } from "sonner";
import { actionCrashed } from "@/lib/action-client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createOrder } from "../actions";
import {
  FormPageShell,
  FormStickyFooter,
} from "@/components/form-sticky-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  OrderChargesEditor,
  chargePayloads,
  chargesTotalExVat,
  validateChargeDrafts,
  type ChargeDraft,
} from "@/components/orders/order-charges-editor";
import { cn } from "@/lib/utils";
import type {
  CustomerRow,
  CustomerStonePriceRow,
  InventoryFinishLevelDb,
  InventoryItemViewRow,
  InventoryPieceTypeDb,
  StoneRow,
} from "@/lib/db/types";
import {
  computeVolumeM3FromCm,
  metersToCmInput,
  pricePerM3ExVatFromInclusive,
  computeTotalWithVat,
  computeVatAmount,
  normalizeDecimalInput,
  roundMoney,
} from "@/lib/db/calculations";
import {
  formatInventoryShipmentSelectLabel,
  INVENTORY_FINISH_LEVEL_OPTIONS,
  INVENTORY_PIECE_TYPE_OPTIONS,
} from "@/lib/db/inventory-taxonomy";
import { formatIls, formatVolumeM3 } from "@/lib/db/format";
import { groupLinesByStone } from "@/lib/orders/stone-item-numbers";

const VAT_RATE = 0.18;
const NOT_IN_STOCK = "__not_in_inventory__";

function newLineKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `ln-${Math.random().toString(36).slice(2)}`;
}

type Line = {
  key: string;
  stone_id: string;
  inventory_item_id: string;
  not_in_inventory: boolean;
  finish_level: InventoryFinishLevelDb;
  piece_type: InventoryPieceTypeDb;
  length_cm: string;
  width_cm: string;
  height_cm: string;
  quantity: string;
  price_per_m3: string;
};

function newEmptyLine(
  opts: {
    notInInventory?: boolean;
    stoneId?: string;
    pricePerM3?: string;
  } = {}
): Line {
  return {
    key: newLineKey(),
    stone_id: opts.stoneId ?? "",
    inventory_item_id: "",
    not_in_inventory: opts.notInInventory ?? false,
    finish_level: "halak",
    piece_type: "panel",
    length_cm: "",
    width_cm: "",
    height_cm: "",
    quantity: "1",
    price_per_m3: opts.pricePerM3 ?? "",
  };
}

function parseLineNumbers(ln: Line) {
  return {
    L: parseFloat(normalizeDecimalInput(ln.length_cm)) || 0,
    W: parseFloat(normalizeDecimalInput(ln.width_cm)) || 0,
    H: parseFloat(normalizeDecimalInput(ln.height_cm)) || 0,
    Q: Number(normalizeDecimalInput(ln.quantity)),
    p: parseFloat(normalizeDecimalInput(ln.price_per_m3)),
  };
}

function isLineTouched(ln: Line): boolean {
  return !!(
    ln.stone_id ||
    ln.inventory_item_id ||
    ln.not_in_inventory ||
    ln.length_cm.trim() ||
    ln.width_cm.trim() ||
    ln.height_cm.trim() ||
    ln.price_per_m3.trim() ||
    (ln.quantity.trim() && ln.quantity !== "1")
  );
}

function isLineComplete(ln: Line): boolean {
  const { L, W, H, Q, p } = parseLineNumbers(ln);
  const hasInventory = ln.not_in_inventory || !!ln.inventory_item_id;
  return !!(
    ln.stone_id &&
    hasInventory &&
    L > 0 &&
    W > 0 &&
    H > 0 &&
    Number.isInteger(Q) &&
    Q > 0 &&
    !Number.isNaN(p) &&
    p >= 0
  );
}

function getLineIssues(ln: Line, itemLabel: string): string | null {
  if (!isLineTouched(ln)) return null;
  const prefix = `${itemLabel}:`;
  if (!ln.stone_id) return `${prefix} חסרה בחירת אבן`;
  if (!ln.not_in_inventory && !ln.inventory_item_id) {
    return `${prefix} חסר משלוח במלאי`;
  }
  const { L, W, H, Q, p } = parseLineNumbers(ln);
  if (!L || !W || !H) return `${prefix} חסרות מידות תקינות`;
  if (!Number.isInteger(Q) || Q <= 0) return `${prefix} כמות לא תקינה`;
  if (Number.isNaN(p) || p < 0) return `${prefix} מחיר לא תקין`;
  return null;
}

function effectiveLinePricePerM3(
  invId: string,
  forCustomerId: string,
  inventory: InventoryItemViewRow[],
  overrides: CustomerStonePriceRow[]
): number | null {
  if (!invId) return null;
  const invRow = inventory.find((i) => i.id === invId);
  if (!invRow) return null;
  if (forCustomerId) {
    const ov = overrides.find(
      (o) =>
        o.customer_id === forCustomerId && o.stone_id === invRow.stone_id
    );
    if (ov?.price_per_m3 != null) return Number(ov.price_per_m3);
  }
  return Number(invRow.customer_price);
}

function buildLineFromInventory(
  inv: InventoryItemViewRow,
  forCustomerId: string,
  inventory: InventoryItemViewRow[],
  overrides: CustomerStonePriceRow[]
): Line {
  const price = effectiveLinePricePerM3(
    inv.id,
    forCustomerId,
    inventory,
    overrides
  );
  return {
    key: newLineKey(),
    stone_id: inv.stone_id,
    inventory_item_id: inv.id,
    not_in_inventory: false,
    finish_level: inv.finish_level,
    piece_type: inv.piece_type,
    length_cm: metersToCmInput(Number(inv.length_m)),
    width_cm: metersToCmInput(Number(inv.width_m)),
    height_cm: metersToCmInput(Number(inv.height_m)),
    quantity: "1",
    price_per_m3:
      price != null && !Number.isNaN(price) ? String(price) : "",
  };
}

function validateLines(lines: Line[]): string | null {
  const groups = groupLinesByStone(lines);
  const labelByKey = new Map<string, string>();
  for (const g of groups) {
    const label =
      g.itemNumber != null ? `פריט ${g.itemNumber}` : "פריט חדש";
    for (const ln of g.lines) labelByKey.set(ln.key, label);
  }

  const complete = lines.filter(isLineComplete);
  if (complete.length === 0) {
    const touchedIncomplete = lines
      .map((ln) => getLineIssues(ln, labelByKey.get(ln.key) ?? "פריט"))
      .find((msg) => msg != null);
    if (touchedIncomplete) return touchedIncomplete;
    return "נא לבחור אבן ומשלוח במלאי לפחות לפריט אחד";
  }
  for (const ln of lines) {
    const issue = getLineIssues(ln, labelByKey.get(ln.key) ?? "פריט");
    if (issue) return issue;
  }
  return null;
}

function linePreview(ln: Line, vatIncluded: boolean) {
  const { L, W, H, Q, p } = parseLineNumbers(ln);
  const vol =
    L && W && H && Q
      ? computeVolumeM3FromCm({
          lengthCm: L,
          widthCm: W,
          heightCm: H,
          quantity: Q,
        })
      : null;
  // מחשבים בדיוק כמו ה-DB: מחיר numeric(12,2), מידות numeric(10,3) במטרים,
  // line_subtotal = ROUND(L*W*H*Q*price, 2) — כדי שהתצוגה המקדימה תתאים לסכום שיישמר.
  const priceEx =
    vol != null && p
      ? roundMoney(
          vatIncluded ? pricePerM3ExVatFromInclusive(p, VAT_RATE) : p
        )
      : null;
  const lineSub =
    vol != null && priceEx != null
      ? roundMoney(
          (Math.round(L * 10) / 1000) *
            (Math.round(W * 10) / 1000) *
            (Math.round(H * 10) / 1000) *
            Q *
            priceEx
        )
      : null;
  return { vol, lineSub };
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
    // <label> עוטף את השדה — שם נגיש לקורא מסך ולחיצה על הכותרת מפעילה את השדה
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

export function OrderForm({
  customers,
  stones,
  inventory,
  overrides,
  initialInventoryIds = [],
  today,
}: {
  /** היום (YYYY-MM-DD, שעון ישראל) — ברירת המחדל לתאריך המסמך */
  today: string;
  customers: CustomerRow[];
  stones: StoneRow[];
  inventory: InventoryItemViewRow[];
  overrides: CustomerStonePriceRow[];
  initialInventoryIds?: string[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "urgent">(
    "medium"
  );
  const [supplyDue, setSupplyDue] = useState("");
  const [signatureUrl, setSignatureUrl] = useState("");
  const [vatIncluded, setVatIncluded] = useState(false);
  const [documentDate, setDocumentDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [charges, setCharges] = useState<ChargeDraft[]>([]);
  // זריעה מראש משורות מלאי שנבחרו (?inventory=...) — בלי effect, בלי הבהוב
  const [lines, setLines] = useState<Line[]>(() => {
    const seeded = initialInventoryIds
      .map((id) => inventory.find((i) => i.id === id))
      .filter((inv): inv is InventoryItemViewRow => inv != null)
      .map((inv) => buildLineFromInventory(inv, "", inventory, overrides));
    return seeded.length > 0 ? seeded : [newEmptyLine()];
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useUnsavedChangesWarning(
    !pending &&
      (!!customerId ||
        lines.some(isLineTouched) ||
        charges.length > 0 ||
        !!notes.trim())
  );

  const stoneGroups = useMemo(() => groupLinesByStone(lines), [lines]);


  /**
   * מחירי מלאי ומחירים מיוחדים שמורים לפני מע״מ. כשהמשתמש סימן "כולל מע״מ"
   * מציגים אותם כשהם כוללים מע״מ — אחרת השרת יחלק שוב ב-1.18 והמחיר יירד.
   */
  function shownPrice(exVat: number): string {
    return String(
      vatIncluded ? roundMoney(exVat * (1 + VAT_RATE)) : roundMoney(exVat)
    );
  }

  function handleVatIncludedChange(next: boolean) {
    if (next === vatIncluded) return;
    const factor = 1 + VAT_RATE;
    setVatIncluded(next);
    setLines((prev) =>
      prev.map((ln) => {
        const p = parseFloat(normalizeDecimalInput(ln.price_per_m3));
        if (!ln.price_per_m3.trim() || Number.isNaN(p)) return ln;
        const converted = next ? p * factor : p / factor;
        return { ...ln, price_per_m3: String(roundMoney(converted)) };
      })
    );
    // גם סכומי החיובים הנוספים מוצגים לפי אותו דגל
    setCharges((prev) =>
      prev.map((c) => {
        const a = parseFloat(normalizeDecimalInput(c.amount));
        if (!c.amount.trim() || Number.isNaN(a)) return c;
        const converted = next ? a * factor : a / factor;
        return { ...c, amount: String(roundMoney(converted)) };
      })
    );
  }

  function linePrice(invId: string, forCustomerId: string): number | null {
    return effectiveLinePricePerM3(
      invId,
      forCustomerId,
      inventory,
      overrides
    );
  }

  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    setLines((prev) => {
      const groups = groupLinesByStone(prev);
      return prev.map((ln) => {
        if (ln.not_in_inventory) {
          const ov = overrides.find(
            (o) =>
              o.customer_id === nextCustomerId && o.stone_id === ln.stone_id
          );
          if (ov?.price_per_m3 != null) {
            return { ...ln, price_per_m3: shownPrice(Number(ov.price_per_m3)) };
          }
          return ln;
        }
        if (!ln.inventory_item_id) return ln;
        const group = groups.find((g) =>
          g.lines.some((x) => x.key === ln.key)
        );
        const firstInv =
          group?.lines.find((x) => x.inventory_item_id)?.inventory_item_id ??
          ln.inventory_item_id;
        const dp = linePrice(firstInv, nextCustomerId);
        if (dp == null || Number.isNaN(dp)) return ln;
        return { ...ln, price_per_m3: shownPrice(dp) };
      });
    });
  }

  function inventoryForStone(stoneId: string) {
    return inventory
      .filter(
        (i) =>
          i.stone_id === stoneId &&
          i.quantity_available > 0 &&
          i.status === "available"
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  function customerOverridePrice(stoneId: string): number | null {
    if (!customerId || !stoneId) return null;
    const ov = overrides.find(
      (o) => o.customer_id === customerId && o.stone_id === stoneId
    );
    return ov?.price_per_m3 != null ? Number(ov.price_per_m3) : null;
  }

  function setGroupPrice(groupKeys: string[], price: string) {
    const keySet = new Set(groupKeys);
    setLines((prev) =>
      prev.map((ln) =>
        keySet.has(ln.key) ? { ...ln, price_per_m3: price } : ln
      )
    );
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => {
      const groups = groupLinesByStone(prev);
      return prev.map((ln) => {
        if (ln.key !== key) return ln;
        const next = { ...ln, ...patch };

        if (patch.not_in_inventory === true && !ln.not_in_inventory) {
          next.inventory_item_id = "";
        }

        if (
          patch.inventory_item_id != null &&
          patch.inventory_item_id !== ln.inventory_item_id &&
          patch.inventory_item_id !== ""
        ) {
          next.not_in_inventory = false;
          const invRow = inventory.find(
            (i) => i.id === patch.inventory_item_id
          );
          if (invRow) {
            next.length_cm = metersToCmInput(Number(invRow.length_m));
            next.width_cm = metersToCmInput(Number(invRow.width_m));
            next.height_cm = metersToCmInput(Number(invRow.height_m));
            next.finish_level = invRow.finish_level;
            next.piece_type = invRow.piece_type;
            // Fill shared group price only if empty
            const group = groups.find((g) =>
              g.lines.some((x) => x.key === key)
            );
            const groupHasPrice = group?.lines.some((x) =>
              x.price_per_m3.trim()
            );
            if (!groupHasPrice && !ln.price_per_m3.trim()) {
              const dp = linePrice(invRow.id, customerId);
              if (dp != null && !Number.isNaN(dp)) {
                next.price_per_m3 = shownPrice(dp);
              }
            }
          }
        }
        return next;
      });
    });

    // After inventory pick with empty group price — sync price to whole group
    if (patch.inventory_item_id) {
      const invRow = inventory.find((i) => i.id === patch.inventory_item_id);
      if (invRow) {
        setLines((prev) => {
          const groups = groupLinesByStone(prev);
          const group = groups.find((g) =>
            g.lines.some((x) => x.key === key)
          );
          if (!group) return prev;
          const groupHasPrice = group.lines.some((x) => x.price_per_m3.trim());
          if (groupHasPrice) return prev;
          const dp = linePrice(invRow.id, customerId);
          if (dp == null || Number.isNaN(dp)) return prev;
          const keySet = new Set(group.lines.map((x) => x.key));
          return prev.map((ln) =>
            keySet.has(ln.key) ? { ...ln, price_per_m3: shownPrice(dp) } : ln
          );
        });
      }
    }
  }

  function setGroupStone(groupKeys: string[], nextStoneId: string) {
    setLines((prev) => {
      const keySet = new Set(groupKeys);
      const ov = customerOverridePrice(nextStoneId);
      return prev.map((ln) => {
        if (!keySet.has(ln.key)) return ln;
        if (ln.stone_id === nextStoneId) return ln;
        const next: Line = {
          ...ln,
          stone_id: nextStoneId,
          inventory_item_id: "",
        };
        if (!next.not_in_inventory) {
          next.length_cm = "";
          next.width_cm = "";
          next.height_cm = "";
          const opts = inventoryForStone(nextStoneId);
          if (opts.length === 1) {
            const inv = opts[0];
            next.inventory_item_id = inv.id;
            next.length_cm = metersToCmInput(Number(inv.length_m));
            next.width_cm = metersToCmInput(Number(inv.width_m));
            next.height_cm = metersToCmInput(Number(inv.height_m));
            next.finish_level = inv.finish_level;
            next.piece_type = inv.piece_type;
          }
        }
        // מחיר האבן הקודמת לא רלוונטי לאבן החדשה
        if (ov != null && !Number.isNaN(ov)) {
          next.price_per_m3 = shownPrice(ov);
        } else if (next.inventory_item_id) {
          const dp = linePrice(next.inventory_item_id, customerId);
          next.price_per_m3 =
            dp != null && !Number.isNaN(dp) ? shownPrice(dp) : "";
        } else {
          next.price_per_m3 = "";
        }
        return next;
      });
    });
  }

  function addRowToGroup(stoneId: string, notInInventory: boolean) {
    setLines((prev) => {
      const group = groupLinesByStone(prev).find((g) => g.stone_id === stoneId);
      const sharedPrice = group?.lines.find((x) => x.price_per_m3.trim())
        ?.price_per_m3;
      return [
        ...prev,
        newEmptyLine({
          notInInventory,
          stoneId,
          pricePerM3: sharedPrice,
        }),
      ];
    });
  }

  function removeLine(key: string) {
    setLines((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((x) => x.key !== key);
    });
  }

  function removeGroup(keys: string[]) {
    setLines((prev) => {
      const keySet = new Set(keys);
      const next = prev.filter((x) => !keySet.has(x.key));
      return next.length > 0 ? next : [newEmptyLine()];
    });
  }

  const totalsPreview = useMemo(() => {
    let subtotalEx = 0;
    let totalVolumeM3 = 0;
    for (const ln of lines) {
      const { vol, lineSub } = linePreview(ln, vatIncluded);
      if (vol != null) totalVolumeM3 += vol;
      if (lineSub != null) subtotalEx += lineSub;
    }
    const chargesEx = chargesTotalExVat(charges, vatIncluded, VAT_RATE);
    subtotalEx = roundMoney(subtotalEx + chargesEx);
    const vat = computeVatAmount(subtotalEx, VAT_RATE);
    const total = computeTotalWithVat(subtotalEx, VAT_RATE);
    return { subtotalEx, vat, total, totalVolumeM3, chargesEx };
  }, [lines, vatIncluded, charges]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      setError("נא לבחור לקוח");
      return;
    }

    const validationError = validateLines(lines) ?? validateChargeDrafts(charges);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (totalsPreview.subtotalEx < 0) {
      setError("ההנחה גדולה מסכום ההזמנה");
      return;
    }
    if (!documentDate) {
      setError("נא לבחור תאריך מסמך");
      return;
    }

    setPending(true);
    setError(null);

    const items = lines.filter(isLineComplete).map((ln) => {
      const { L, W, H, Q, p } = parseLineNumbers(ln);
      return {
        stone_id: ln.stone_id,
        inventory_item_id: ln.not_in_inventory
          ? null
          : ln.inventory_item_id,
        not_in_inventory: ln.not_in_inventory,
        finish_level: ln.not_in_inventory ? ln.finish_level : null,
        piece_type: ln.not_in_inventory ? ln.piece_type : null,
        length_m: L / 100,
        width_m: W / 100,
        height_m: H / 100,
        quantity: Q,
        price_per_m3: p,
      };
    });

    const res = await createOrder({
      customer_id: customerId,
      document_date: documentDate,
      notes: notes.trim() || null,
      charges: chargePayloads(charges),
      priority,
      supply_due_date: supplyDue || null,
      signature_url: signatureUrl.trim() || null,
      vat_rate: VAT_RATE,
      vat_included: vatIncluded,
      items,
    }).catch(actionCrashed);
    if (!res.ok) {
      setPending(false);
      setError(res.message);
      return;
    }
    toast.success("ההזמנה נוצרה");
    router.push(`/dashboard/orders/${res.id}`);
  }

  return (
    <FormPageShell>
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto flex w-full max-w-[min(100%,56rem)] flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                תעודת הזמנה חדשה
              </h2>
              <p className="text-muted-foreground text-sm">
                כל סוג אבן = פריט אחד. הוסיפו שורות מידות בתוך הפריט —
                המחיר מחושב יחד.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="לקוח">
                <Select
                  dir="rtl"
                  value={customerId || undefined}
                  onValueChange={handleCustomerChange}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="בחר לקוח" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="תעדוף">
                <Select
                  dir="rtl"
                  value={priority}
                  onValueChange={(v) =>
                    setPriority(v as "low" | "medium" | "urgent")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="low">נמוך</SelectItem>
                    <SelectItem value="medium">בינוני</SelectItem>
                    <SelectItem value="urgent">דחוף</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="יעד אספקה">
                <Input
                  type="date"
                  dir="ltr"
                  value={supplyDue}
                  onChange={(e) => setSupplyDue(e.target.value)}
                />
              </Field>
              <Field label="תאריך המסמך">
                <Input
                  type="date"
                  dir="ltr"
                  value={documentDate}
                  onChange={(e) => setDocumentDate(e.target.value)}
                  required
                />
              </Field>
              <Field label="קישור לחתימה">
                <Input
                  dir="ltr"
                  value={signatureUrl}
                  onChange={(e) => setSignatureUrl(e.target.value)}
                  placeholder="https://…"
                />
              </Field>
              <Field label="הערות" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="הערות להזמנה (יופיעו בתעודה)"
                />
              </Field>
            </div>
            <p className="-mt-3 text-muted-foreground text-xs">
              תאריך המסמך קובע לאיזה חודש ההזמנה נספרת ב״הכנסות החודש״ (ברירת
              מחדל: היום).
            </p>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={vatIncluded}
                onChange={(e) => handleVatIncludedChange(e.target.checked)}
              />
              מחיר לקו״ב כולל מע״מ (יומר לנטו לפני שמירה)
            </label>

            <Separator />

            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-foreground">פריטים</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setLines((prev) => [...prev, newEmptyLine()])
                  }
                >
                  פריט חדש
                </Button>
              </div>

              {stoneGroups.map((group) => {
                const groupLineKeys = group.lines.map((l) => l.key);
                const stoneName =
                  stones.find((s) => s.id === group.stone_id)?.name ?? null;
                const title =
                  group.itemNumber != null
                    ? `פריט ${group.itemNumber}${
                        stoneName ? ` · ${stoneName}` : ""
                      }`
                    : "פריט חדש";
                const sharedPrice =
                  group.lines.find((x) => x.price_per_m3.trim())
                    ?.price_per_m3 ?? "";

                let groupVol = 0;
                let groupSub = 0;
                let hasVol = false;
                let hasSub = false;
                for (const ln of group.lines) {
                  const { vol, lineSub } = linePreview(ln, vatIncluded);
                  if (vol != null) {
                    groupVol += vol;
                    hasVol = true;
                  }
                  if (lineSub != null) {
                    groupSub += lineSub;
                    hasSub = true;
                  }
                }

                return (
                  <div
                    key={group.groupKey}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {title}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeGroup(groupLineKeys)}
                      >
                        הסרה
                      </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[1fr_8rem_minmax(0,1fr)] sm:items-end">
                      <Field label="סוג אבן">
                        <Select
                          dir="rtl"
                          value={group.stone_id || undefined}
                          onValueChange={(v) =>
                            setGroupStone(groupLineKeys, v)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="בחר אבן" />
                          </SelectTrigger>
                          <SelectContent dir="rtl">
                            {stones.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="מחיר לקו״ב">
                        <Input
                          dir="ltr"
                          inputMode="decimal"
                          value={sharedPrice}
                          onChange={(e) =>
                            setGroupPrice(groupLineKeys, e.target.value)
                          }
                          placeholder="0"
                        />
                      </Field>
                      <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm tabular-nums">
                        <span className="text-muted-foreground">סה״כ פריט: </span>
                        {hasVol
                          ? `${formatVolumeM3(groupVol)} קו״ב`
                          : "—"}{" "}
                        · {hasSub ? formatIls(groupSub) : "—"}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="hidden text-muted-foreground grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,5rem))_minmax(0,4.5rem)_auto] gap-2 text-xs sm:grid">
                        <span>מקור</span>
                        <span>גובה</span>
                        <span>רוחב</span>
                        <span>אורך</span>
                        <span>כמות</span>
                        <span>נפח</span>
                        <span />
                      </div>

                      {group.lines.map((ln) => {
                        const invOptions = ln.stone_id
                          ? inventoryForStone(ln.stone_id)
                          : [];
                        const { vol } = linePreview(ln, vatIncluded);
                        const sourceValue = ln.not_in_inventory
                          ? NOT_IN_STOCK
                          : ln.inventory_item_id || undefined;

                        return (
                          <div
                            key={ln.key}
                            className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/10 p-2 sm:gap-2"
                          >
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,5rem))_minmax(0,4.5rem)_auto] sm:items-center">
                              <Select
                                dir="rtl"
                                value={sourceValue}
                                onValueChange={(v) => {
                                  if (v === NOT_IN_STOCK) {
                                    updateLine(ln.key, {
                                      not_in_inventory: true,
                                      inventory_item_id: "",
                                    });
                                    return;
                                  }
                                  updateLine(ln.key, {
                                    not_in_inventory: false,
                                    inventory_item_id: v,
                                  });
                                }}
                                disabled={!ln.stone_id}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="משלוח / לא במלאי" />
                                </SelectTrigger>
                                <SelectContent dir="rtl">
                                  <SelectItem value={NOT_IN_STOCK}>
                                    לא במלאי
                                  </SelectItem>
                                  {invOptions.map((i) => (
                                    <SelectItem
                                      key={i.id}
                                      value={i.id}
                                      textValue={formatInventoryShipmentSelectLabel(
                                        i
                                      )}
                                    >
                                      {formatInventoryShipmentSelectLabel(i)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <Input
                                dir="ltr"
                                inputMode="decimal"
                                aria-label="גובה ס״מ"
                                placeholder="גובה"
                                value={ln.height_cm}
                                onChange={(e) =>
                                  updateLine(ln.key, {
                                    height_cm: e.target.value,
                                  })
                                }
                              />
                              <Input
                                dir="ltr"
                                inputMode="decimal"
                                aria-label="רוחב ס״מ"
                                placeholder="רוחב"
                                value={ln.width_cm}
                                onChange={(e) =>
                                  updateLine(ln.key, {
                                    width_cm: e.target.value,
                                  })
                                }
                              />
                              <Input
                                dir="ltr"
                                inputMode="decimal"
                                aria-label="אורך ס״מ"
                                placeholder="אורך"
                                value={ln.length_cm}
                                onChange={(e) =>
                                  updateLine(ln.key, {
                                    length_cm: e.target.value,
                                  })
                                }
                              />
                              <Input
                                dir="ltr"
                                inputMode="numeric"
                                aria-label="כמות"
                                placeholder="כמות"
                                value={ln.quantity}
                                onChange={(e) =>
                                  updateLine(ln.key, {
                                    quantity: e.target.value,
                                  })
                                }
                              />
                              <div className="text-muted-foreground px-1 text-xs tabular-nums">
                                {vol != null
                                  ? formatVolumeM3(vol)
                                  : "—"}
                              </div>
                              {group.lines.length > 1 ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="justify-self-start"
                                  onClick={() => removeLine(ln.key)}
                                >
                                  ×
                                </Button>
                              ) : (
                                <span />
                              )}
                            </div>

                            {ln.not_in_inventory ? (
                              <div className="grid gap-2 sm:grid-cols-2">
                                <Select
                                  dir="rtl"
                                  value={ln.finish_level}
                                  onValueChange={(v) =>
                                    updateLine(ln.key, {
                                      finish_level:
                                        v as InventoryFinishLevelDb,
                                    })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="גימור" />
                                  </SelectTrigger>
                                  <SelectContent dir="rtl">
                                    {INVENTORY_FINISH_LEVEL_OPTIONS.map(
                                      (o) => (
                                        <SelectItem
                                          key={o.value}
                                          value={o.value}
                                        >
                                          {o.label}
                                        </SelectItem>
                                      )
                                    )}
                                  </SelectContent>
                                </Select>
                                <Select
                                  dir="rtl"
                                  value={ln.piece_type}
                                  onValueChange={(v) =>
                                    updateLine(ln.key, {
                                      piece_type: v as InventoryPieceTypeDb,
                                    })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="חלק" />
                                  </SelectTrigger>
                                  <SelectContent dir="rtl">
                                    {INVENTORY_PIECE_TYPE_OPTIONS.map((o) => (
                                      <SelectItem
                                        key={o.value}
                                        value={o.value}
                                      >
                                        {o.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    {group.stone_id ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="self-start"
                        onClick={() =>
                          addRowToGroup(group.stone_id, false)
                        }
                      >
                        + שורה
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <Separator />

            <OrderChargesEditor
              charges={charges}
              onChange={setCharges}
              vatIncluded={vatIncluded}
              vatRate={VAT_RATE}
            />

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">סה״כ קוב</span>
                  <span className="tabular-nums font-medium">
                    {totalsPreview.totalVolumeM3 > 0
                      ? `${formatVolumeM3(totalsPreview.totalVolumeM3)} קו״ב`
                      : "—"}
                  </span>
                </div>
                {totalsPreview.chargesEx !== 0 ? (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      מתוכם חיובים נוספים / הנחות
                    </span>
                    <span className="tabular-nums font-medium">
                      {formatIls(totalsPreview.chargesEx)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">סכום לפני מע״מ</span>
                  <span className="tabular-nums font-medium">
                    {formatIls(totalsPreview.subtotalEx)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">
                    מע״מ ({VAT_RATE * 100}%)
                  </span>
                  <span className="tabular-nums font-medium">
                    {formatIls(totalsPreview.vat)}
                  </span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between gap-4">
                  <span className="font-semibold text-foreground">
                    סה״כ כולל מע״מ
                  </span>
                  <span className="tabular-nums font-semibold">
                    {formatIls(totalsPreview.total)}
                  </span>
                </div>
              </div>
            </div>

            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <FormStickyFooter className="justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard/orders")}
          >
            ביטול
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "יוצר…" : "יצירת הזמנה"}
          </Button>
        </FormStickyFooter>
      </form>
    </FormPageShell>
  );
}
