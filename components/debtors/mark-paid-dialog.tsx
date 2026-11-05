"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { markDeliveryPaid } from "@/app/dashboard/deliveries/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { actionCrashed } from "@/lib/action-client";
import { formatIls, todayIsoInIsrael } from "@/lib/db/format";
import { paymentMethodOptions } from "@/lib/db/labels";
import type { PaymentMethodDb } from "@/lib/db/types";

export type MarkPaidTarget = {
  delivery_id: string;
  delivery_number: number;
  customer_name: string;
  balance: number;
  payment_method?: PaymentMethodDb | null;
};

/**
 * "סמן כשולם במלואו": רושם תשלום אחד על כל יתרת התעודה
 * (markDeliveryPaid → crm_mark_delivery_paid) עם אמצעי, תאריך ואסמכתא.
 * ההורה מרכיב מחדש (key) לכל תעודה.
 */
export function MarkPaidDialog({
  target,
  onOpenChange,
  onDone,
}: {
  target: MarkPaidTarget | null;
  onOpenChange: (open: boolean) => void;
  onDone?: (paymentId: string | undefined) => void;
}) {
  const [method, setMethod] = useState<PaymentMethodDb | "">(
    target?.payment_method ?? ""
  );
  const [paidAt, setPaidAt] = useState(() => todayIsoInIsrael());
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!target) return;
    if (!method) {
      setError("יש לבחור אמצעי תשלום");
      return;
    }
    if (!paidAt) {
      setError("יש להזין תאריך תשלום");
      return;
    }
    setError(null);
    setPending(true);
    const res = await markDeliveryPaid(target.delivery_id, {
      method,
      paid_at: paidAt,
      reference: reference.trim() || null,
    }).catch(actionCrashed);
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      toast.error(res.message);
      return;
    }
    toast.success(
      res.id
        ? `תעודה #${target.delivery_number} סומנה כשולמה במלואה (${formatIls(target.balance)})`
        : `תעודה #${target.delivery_number} כבר שולמה במלואה`
    );
    onOpenChange(false);
    onDone?.(res.id);
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target ? `סימון תעודה #${target.delivery_number} כשולמה במלואה` : ""}
          </DialogTitle>
          <DialogDescription>
            {target
              ? `יירשם תשלום של ${formatIls(target.balance)} מ${target.customer_name} על כל יתרת התעודה. לתשלום חלקי או לתשלום שמכסה כמה תעודות השתמשו ב״רישום תשלום״.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">אמצעי תשלום</span>
            <Select
              dir="rtl"
              value={method || undefined}
              onValueChange={(v) => setMethod(v as PaymentMethodDb)}
              disabled={pending}
            >
              <SelectTrigger aria-invalid={error && !method ? true : undefined}>
                <SelectValue placeholder="בחרו אמצעי תשלום" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {paymentMethodOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">תאריך תשלום</span>
            <Input
              type="date"
              dir="ltr"
              value={paidAt}
              disabled={pending}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              אסמכתא (מס׳ צ׳ק / מס׳ העברה)
            </span>
            <Input
              dir="ltr"
              value={reference}
              maxLength={200}
              disabled={pending}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
          <Button
            type="button"
            disabled={pending}
            aria-busy={pending}
            onClick={() => void handleConfirm()}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {pending ? "רושם…" : "אישור — שולם במלואו"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
