"use client";

import { toast } from "sonner";
import { actionCrashed } from "@/lib/action-client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { updateOrderHeader } from "../../actions";
import {
  FormPageShell,
  FormStickyFooter,
} from "@/components/form-sticky-footer";
import {
  OrderChargesEditor,
  chargeDraftsFromRows,
  chargePayloads,
  chargesTotalExVat,
  validateChargeDrafts,
  type ChargeDraft,
} from "@/components/orders/order-charges-editor";
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
  computeTotalWithVat,
  computeVatAmount,
  normalizeDecimalInput,
  roundMoney,
} from "@/lib/db/calculations";
import { formatIls } from "@/lib/db/format";
import { cn } from "@/lib/utils";
import type { OrderChargeRow, OrderRow } from "@/lib/db/types";

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

/** ההודעה מ-toHebrewError ל-"order has delivery" */
const ORDER_HAS_DELIVERY_RE = /תעודת משלוח/;

export function OrderHeaderEditForm({
  order,
  charges: initialCharges,
  deliveryNumber,
}: {
  order: OrderRow;
  charges: OrderChargeRow[];
  /** מספר תעודת המשלוח אם כבר הופקה (החיובים נעולים) */
  deliveryNumber: number | null;
}) {
  const router = useRouter();
  const vatRate = Number(order.vat_rate ?? 0.18);
  const [priority, setPriority] = useState(order.priority);
  const [status, setStatus] = useState(order.status);
  const [supplyDue, setSupplyDue] = useState(order.supply_due_date ?? "");
  const [signatureUrl, setSignatureUrl] = useState(order.signature_url ?? "");
  const [documentDate, setDocumentDate] = useState(order.document_date ?? "");
  const [notes, setNotes] = useState(order.notes ?? "");
  const [chargesVatIncluded, setChargesVatIncluded] = useState(
    order.vat_included
  );
  const [charges, setCharges] = useState<ChargeDraft[]>(() =>
    chargeDraftsFromRows(initialCharges, order.vat_included, vatRate)
  );
  const [lockedByServer, setLockedByServer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const locked = deliveryNumber != null || lockedByServer;
  const lockedReason = locked
    ? `להזמנה כבר הופקה תעודת משלוח${
        deliveryNumber != null ? ` #${deliveryNumber}` : ""
      } — הסכומים בה קפואים ולכן אי אפשר לשנות חיובים. לתיקון: לבטל/למחוק את תעודת המשלוח (מנהל) או להוציא זיכוי.`
    : null;

  const itemsSubtotal = useMemo(() => {
    const existingCharges = initialCharges.reduce(
      (s, c) => s + Number(c.amount),
      0
    );
    return roundMoney(Number(order.subtotal) - existingCharges);
  }, [initialCharges, order.subtotal]);

  const preview = useMemo(() => {
    const chargesEx = chargesTotalExVat(charges, chargesVatIncluded, vatRate);
    const subtotal = roundMoney(itemsSubtotal + chargesEx);
    return {
      chargesEx,
      subtotal,
      vat: computeVatAmount(subtotal, vatRate),
      total: computeTotalWithVat(subtotal, vatRate),
    };
  }, [charges, chargesVatIncluded, itemsSubtotal, vatRate]);

  function handleChargesVatChange(next: boolean) {
    if (next === chargesVatIncluded) return;
    const factor = 1 + vatRate;
    setChargesVatIncluded(next);
    setCharges((prev) =>
      prev.map((c) => {
        const a = parseFloat(normalizeDecimalInput(c.amount));
        if (!c.amount.trim() || Number.isNaN(a)) return c;
        return {
          ...c,
          amount: String(roundMoney(next ? a * factor : a / factor)),
        };
      })
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!locked) {
      const chargesError = validateChargeDrafts(charges);
      if (chargesError) {
        setError(chargesError);
        return;
      }
      if (preview.subtotal < 0) {
        setError("ההנחה גדולה מסכום ההזמנה");
        return;
      }
    }
    if (!documentDate) {
      setError("נא לבחור תאריך מסמך");
      return;
    }
    setPending(true);
    setError(null);
    const res = await updateOrderHeader({
      id: order.id,
      priority,
      status,
      supply_due_date: supplyDue || null,
      signature_url: signatureUrl.trim() || null,
      document_date: documentDate,
      notes: notes.trim() || null,
      ...(locked
        ? {}
        : {
            charges: chargePayloads(charges),
            charges_vat_included: chargesVatIncluded,
          }),
    }).catch(actionCrashed);
    if (!res.ok) {
      setPending(false);
      setError(res.message);
      if (ORDER_HAS_DELIVERY_RE.test(res.message)) setLockedByServer(true);
      return;
    }
    toast.success("ההזמנה עודכנה");
    router.push(`/dashboard/orders/${order.id}`);
  }

  return (
    <FormPageShell>
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto flex w-full max-w-[min(100%,48rem)] flex-col gap-6">
            <h2 className="text-lg font-semibold text-foreground">
              עריכת הזמנה #{order.order_number}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="תעדוף">
                <Select
                  dir="rtl"
                  value={priority}
                  onValueChange={(v) =>
                    setPriority(v as typeof priority)
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
              <Field label="סטטוס">
                <Select
                  dir="rtl"
                  value={status}
                  onValueChange={(v) => setStatus(v as typeof status)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="open">פתוחה</SelectItem>
                    <SelectItem value="in_production">בייצור</SelectItem>
                    <SelectItem value="ready_for_delivery">
                      מוכנה למשלוח
                    </SelectItem>
                    <SelectItem value="completed">הושלמה</SelectItem>
                    <SelectItem value="cancelled">בוטלה</SelectItem>
                  </SelectContent>
                </Select>
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
              <Field label="יעד אספקה">
                <Input
                  type="date"
                  dir="ltr"
                  value={supplyDue}
                  onChange={(e) => setSupplyDue(e.target.value)}
                />
              </Field>
              <Field label="קישור חתימה" className="sm:col-span-2">
                <Input
                  dir="ltr"
                  value={signatureUrl}
                  onChange={(e) => setSignatureUrl(e.target.value)}
                />
              </Field>
              <Field label="הערות" className="sm:col-span-2">
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="הערות להזמנה (יופיעו בתעודה)"
                />
              </Field>
            </div>

            <Separator />

            {!locked ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={chargesVatIncluded}
                  onChange={(e) => handleChargesVatChange(e.target.checked)}
                />
                סכומי החיובים כוללים מע״מ (יומרו לנטו לפני שמירה)
              </label>
            ) : null}

            <OrderChargesEditor
              charges={charges}
              onChange={setCharges}
              vatIncluded={chargesVatIncluded}
              vatRate={vatRate}
              lockedReason={lockedReason}
            />

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">פריטים לפני מע״מ</span>
                  <span className="tabular-nums font-medium">
                    {formatIls(itemsSubtotal)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">
                    חיובים נוספים / הנחות
                  </span>
                  <span className="tabular-nums font-medium">
                    {formatIls(preview.chargesEx)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">סכום לפני מע״מ</span>
                  <span className="tabular-nums font-medium">
                    {formatIls(preview.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">
                    מע״מ ({Math.round(vatRate * 100)}%)
                  </span>
                  <span className="tabular-nums font-medium">
                    {formatIls(preview.vat)}
                  </span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between gap-4">
                  <span className="font-semibold text-foreground">
                    סה״כ כולל מע״מ
                  </span>
                  <span className="tabular-nums font-semibold">
                    {formatIls(preview.total)}
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
        <FormStickyFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/orders/${order.id}`)}
          >
            ביטול
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "שומר…" : "שמירה"}
          </Button>
        </FormStickyFooter>
      </form>
    </FormPageShell>
  );
}
