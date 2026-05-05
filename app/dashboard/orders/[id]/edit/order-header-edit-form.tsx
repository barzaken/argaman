"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateOrderHeader } from "../../actions";
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
import type { OrderRow } from "@/lib/db/types";

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

export function OrderHeaderEditForm({ order }: { order: OrderRow }) {
  const router = useRouter();
  const [priority, setPriority] = useState(order.priority);
  const [status, setStatus] = useState(order.status);
  const [supplyDue, setSupplyDue] = useState(order.supply_due_date ?? "");
  const [signatureUrl, setSignatureUrl] = useState(order.signature_url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await updateOrderHeader({
      id: order.id,
      priority,
      status,
      supply_due_date: supplyDue || null,
      signature_url: signatureUrl.trim() || null,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.push(`/dashboard/orders/${order.id}`);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-background p-4 md:p-8">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-lg flex-col gap-6"
      >
        <h2 className="text-lg font-semibold text-foreground">
          עריכת הזמנה #{order.order_number}
        </h2>
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
              <SelectItem value="ready_for_delivery">מוכנה למשלוח</SelectItem>
              <SelectItem value="completed">הושלמה</SelectItem>
              <SelectItem value="cancelled">בוטלה</SelectItem>
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
        <Field label="קישור חתימה">
          <Input
            dir="ltr"
            value={signatureUrl}
            onChange={(e) => setSignatureUrl(e.target.value)}
          />
        </Field>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
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
        </div>
      </form>
    </div>
  );
}
