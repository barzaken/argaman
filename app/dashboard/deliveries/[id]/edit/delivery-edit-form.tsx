"use client";

import { toast } from "sonner";
import { actionCrashed } from "@/lib/action-client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wallet } from "lucide-react";

import { updateDelivery } from "../../actions";
import { MarkPaidDialog } from "@/components/debtors/mark-paid-dialog";
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
import { cn } from "@/lib/utils";
import type { DeliveryViewRow } from "@/lib/db/types";
import { formatDateShort, formatIls } from "@/lib/db/format";
import { paymentStatusDisplay } from "@/lib/db/labels";

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

export function DeliveryEditForm({ delivery }: { delivery: DeliveryViewRow }) {
  const router = useRouter();
  const [paymentMethod, setPaymentMethod] = useState<string>(
    delivery.payment_method ?? ""
  );
  const [paymentDue, setPaymentDue] = useState(
    delivery.payment_due_date ?? ""
  );
  const [fulfillment, setFulfillment] = useState(delivery.fulfillment_method);
  const [shippingAddress, setShippingAddress] = useState(
    delivery.shipping_address ?? ""
  );
  const [deliveredAt, setDeliveredAt] = useState(delivery.delivered_at ?? "");
  const [greenInvoice, setGreenInvoice] = useState(
    delivery.green_invoice_id ?? ""
  );
  const [status, setStatus] = useState(delivery.status);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [paidDialogOpen, setPaidDialogOpen] = useState(false);
  const balance = Number(delivery.balance ?? 0);
  const amountPaid = Number(delivery.amount_paid ?? 0);
  const isPaid = delivery.payment_status === "paid" || balance <= 0.005;
  const canPay = !isPaid && delivery.status !== "cancelled";
  const newPaymentHref = `/dashboard/payments/new?customer=${delivery.customer_id}&delivery=${delivery.id}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await updateDelivery({
      id: delivery.id,
      payment_method:
        paymentMethod && paymentMethod.length > 0
          ? (paymentMethod as DeliveryViewRow["payment_method"])
          : null,
      payment_due_date: paymentDue || null,
      fulfillment_method: fulfillment,
      shipping_address: shippingAddress || null,
      delivered_at: deliveredAt || null,
      green_invoice_id: greenInvoice.trim() || null,
      status,
    }).catch(actionCrashed);
    if (!res.ok) {
      setPending(false);
      setError(res.message);
      return;
    }
    toast.success("תעודת המשלוח עודכנה");
    router.push(`/dashboard/deliveries/${delivery.id}`);
  }

  return (
    <FormPageShell>
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <h2 className="text-lg font-semibold text-foreground">
          עריכת משלוח #{delivery.delivery_number}
        </h2>

        <Field label="אמצעי תשלום">
          <Select
            dir="rtl"
            value={paymentMethod || "__none__"}
            onValueChange={(v) =>
              setPaymentMethod(v === "__none__" ? "" : v)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="לא נבחר" />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="__none__">ללא</SelectItem>
              <SelectItem value="cash">מזומן</SelectItem>
              <SelectItem value="bank_transfer">העברה בנקאית</SelectItem>
              <SelectItem value="check">צ׳ק</SelectItem>
              <SelectItem value="credit_card">כרטיס אשראי</SelectItem>
              <SelectItem value="other">אחר</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="יעד תשלום">
          <Input
            type="date"
            dir="ltr"
            value={paymentDue}
            onChange={(e) => setPaymentDue(e.target.value)}
          />
        </Field>

        <Field label="איסוף / שילוח">
          <Select
            dir="rtl"
            value={fulfillment}
            onValueChange={(v) =>
              setFulfillment(v as DeliveryViewRow["fulfillment_method"])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="pickup">איסוף</SelectItem>
              <SelectItem value="shipping">שילוח</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {fulfillment === "shipping" ? (
          <Field label="כתובת משלוח">
            <Input
              value={shippingAddress}
              onChange={(e) => setShippingAddress(e.target.value)}
              required
            />
          </Field>
        ) : null}

        <Field label="תאריך מסירה">
          <Input
            type="date"
            dir="ltr"
            value={deliveredAt}
            onChange={(e) => setDeliveredAt(e.target.value)}
          />
        </Field>

        <Field label="Green Invoice ID">
          <Input
            dir="ltr"
            value={greenInvoice}
            onChange={(e) => setGreenInvoice(e.target.value)}
          />
        </Field>

        <section
          aria-label="מצב תשלום"
          className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              מצב תשלום: {paymentStatusDisplay(delivery)}
            </span>
            {canPay ? (
              <Button type="button" size="sm" asChild>
                <Link href={newPaymentHref}>
                  <Wallet data-icon="inline-start" />
                  רישום תשלום
                </Link>
              </Button>
            ) : null}
          </div>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">סכום התעודה</dt>
              <dd className="font-medium tabular-nums">
                {formatIls(Number(delivery.total))}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">שולם</dt>
              <dd className="font-medium tabular-nums">{formatIls(amountPaid)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">יתרה לתשלום</dt>
              <dd
                className={cn(
                  "font-medium tabular-nums",
                  balance > 0.005 && "text-destructive"
                )}
              >
                {formatIls(Math.max(0, balance))}
              </dd>
            </div>
          </dl>
          <p className="text-muted-foreground text-xs">
            {delivery.paid_at
              ? `תשלום אחרון: ${formatDateShort(delivery.paid_at)}. `
              : ""}
            מצב התשלום מתעדכן אוטומטית מהתשלומים הרשומים — אין לערוך אותו
            ידנית.
          </p>
        </section>

        <Field label="סטטוס משלוח">
          <Select
            dir="rtl"
            value={status}
            onValueChange={(v) =>
              setStatus(v as DeliveryViewRow["status"])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="waiting_for_pickup">ממתין לאיסוף</SelectItem>
              <SelectItem value="in_transit">בדרך</SelectItem>
              <SelectItem value="delivered">נמסר</SelectItem>
              <SelectItem value="cancelled">בוטל</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
          </div>
        </div>

        <FormStickyFooter className="justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={!canPay || pending}
            onClick={() => setPaidDialogOpen(true)}
          >
            {isPaid ? "שולם במלואו" : "סמן כשולם במלואו"}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/dashboard/deliveries/${delivery.id}`)}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "שומר…" : "שמירה"}
            </Button>
          </div>
        </FormStickyFooter>
      </form>
      {paidDialogOpen ? (
        <MarkPaidDialog
          target={{
            delivery_id: delivery.id,
            delivery_number: delivery.delivery_number,
            customer_name: delivery.customer_name,
            balance,
            payment_method: delivery.payment_method,
          }}
          onOpenChange={setPaidDialogOpen}
          onDone={() => router.refresh()}
        />
      ) : null}
    </FormPageShell>
  );
}
