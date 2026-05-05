"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { markDeliveryPaid, updateDelivery } from "../../actions";
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
import { cn } from "@/lib/utils";
import type { DeliveryViewRow } from "@/lib/db/types";

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
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
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
  const [paymentStatus, setPaymentStatus] = useState(delivery.payment_status);
  const [status, setStatus] = useState(delivery.status);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      payment_status: paymentStatus,
      status,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.push(`/dashboard/deliveries/${delivery.id}`);
    router.refresh();
  }

  async function handlePaid() {
    const res = await markDeliveryPaid(delivery.id);
    if (!res.ok) setDialogError(res.message);
    else router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-background p-4 md:p-8">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-lg flex-col gap-6"
      >
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

        <Field label="סטטוס תשלום">
          <Select
            dir="rtl"
            value={paymentStatus}
            onValueChange={(v) =>
              setPaymentStatus(v as DeliveryViewRow["payment_status"])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="unpaid">לא שולם</SelectItem>
              <SelectItem value="paid">שולם</SelectItem>
            </SelectContent>
          </Select>
        </Field>

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

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void handlePaid()}>
            סמן כשולם
          </Button>
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
      </form>
      <ErrorDialog
        message={dialogError}
        onClose={() => setDialogError(null)}
      />
    </div>
  );
}
