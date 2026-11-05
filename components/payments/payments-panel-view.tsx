import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateShort, formatIls } from "@/lib/db/format";
import { paymentMethodLabels } from "@/lib/db/labels";
import type { PaymentMethodDb } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/** שורת תשלום בפאנל (מ-payments_view או payment_allocations_view) */
export type PaymentsPanelItem = {
  payment_id: string;
  payment_number: number;
  paid_at: string;
  method: PaymentMethodDb;
  reference: string | null;
  /** בלקוח: סכום התשלום. בתעודה: הסכום ששויך לתעודה */
  amount: number;
  /** בלקוח: זיכוי לא משויך של התשלום */
  unallocated?: number;
  delivery_numbers?: number[];
};

export type PaymentsPanelData = {
  mode: "customer" | "delivery";
  customerId: string;
  deliveryId?: string;
  items: PaymentsPanelItem[];
  /** בלקוח: סכום היתרות הפתוחות. בתעודה: יתרת התעודה */
  balance: number;
  /** בלקוח: זיכוי לא משויך. בתעודה: לא רלוונטי (0) */
  credit: number;
  /** בתעודה: סכום התעודה / שולם / ששולם מחוץ לתשלומים (סימון ידני ישן) */
  total?: number;
  amountPaid?: number;
  paidOutsidePayments?: number;
  error?: string;
};

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn" | "good";
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          "font-semibold tabular-nums",
          tone === "warn" && value > 0 && "text-destructive",
          tone === "good" && value > 0 && "text-emerald-700 dark:text-emerald-400"
        )}
      >
        {formatIls(value)}
      </p>
    </div>
  );
}

/** תצוגה בלבד (בטוח לשימוש גם בתוך Client Component — אין בו טעינת נתונים) */
export function PaymentsPanelView({ data }: { data: PaymentsPanelData }) {
  const newHref =
    data.mode === "delivery"
      ? `/dashboard/payments/new?customer=${data.customerId}&delivery=${data.deliveryId}`
      : `/dashboard/payments/new?customer=${data.customerId}`;
  const canPay = data.mode === "customer" || data.balance > 0.005;

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      aria-label="תשלומים"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">תשלומים</h2>
          <p className="text-muted-foreground text-xs">
            {data.mode === "delivery"
              ? "תשלומים ששויכו לתעודה זו"
              : "תשלומים אחרונים של הלקוח"}
          </p>
        </div>
        {canPay && data.customerId ? (
          <Button size="sm" asChild>
            <Link href={newHref}>
              <Plus data-icon="inline-start" />
              רישום תשלום
            </Link>
          </Button>
        ) : null}
      </div>

      {data.mode === "delivery" ? (
        <div className="grid grid-cols-3 gap-3 rounded-md bg-muted/40 p-3">
          <SummaryCell label="סכום התעודה" value={data.total ?? 0} />
          <SummaryCell label="שולם" value={data.amountPaid ?? 0} tone="good" />
          <SummaryCell label="יתרה לתשלום" value={data.balance} tone="warn" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3">
          <SummaryCell label="יתרה לגבייה" value={data.balance} tone="warn" />
          <SummaryCell label="זיכוי לא משויך" value={data.credit} tone="good" />
        </div>
      )}

      {data.error ? (
        <p className="text-destructive text-sm">{data.error}</p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {data.items.map((i) => (
          <li key={i.payment_id}>
            <Link
              href={`/dashboard/payments/${i.payment_id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/40"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">
                  תשלום #{i.payment_number}
                  <span className="text-muted-foreground font-normal">
                    {" · "}
                    {formatDateShort(i.paid_at)} ·{" "}
                    {paymentMethodLabels[i.method] ?? i.method}
                    {i.reference ? ` · ${i.reference}` : ""}
                  </span>
                </span>
                {i.delivery_numbers && i.delivery_numbers.length > 0 ? (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    תעודות: {i.delivery_numbers.map((n) => `#${n}`).join(", ")}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                {(i.unallocated ?? 0) > 0.005 ? (
                  <Badge variant="outline" className="tabular-nums">
                    זיכוי {formatIls(i.unallocated ?? 0)}
                  </Badge>
                ) : null}
                <span className="tabular-nums font-medium">
                  {formatIls(i.amount)}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {data.items.length === 0 ? (
          <li className="py-3 text-center text-muted-foreground text-sm">
            {data.mode === "delivery" && (data.paidOutsidePayments ?? 0) > 0
              ? `סומן כשולם ידנית (${formatIls(data.paidOutsidePayments ?? 0)}) — אין רשומת תשלום.`
              : "אין תשלומים רשומים."}
          </li>
        ) : data.mode === "delivery" && (data.paidOutsidePayments ?? 0) > 0 ? (
          <li className="text-muted-foreground text-xs">
            בנוסף סומנו {formatIls(data.paidOutsidePayments ?? 0)} כשולמו ידנית
            (ללא רשומת תשלום).
          </li>
        ) : null}
      </ul>
    </section>
  );
}

