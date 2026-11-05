"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { ChevronDown, Printer, Wallet } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import type { DebtorsViewRow } from "@/lib/db/types";
import { formatDateShort, formatIls, isPastDue } from "@/lib/db/format";
import { ErrorDialog } from "@/components/error-dialog";
import { DebtorPrintDialog } from "@/components/debtors/debtor-print-dialog";
import {
  MarkPaidDialog,
  type MarkPaidTarget,
} from "@/components/debtors/mark-paid-dialog";

type CustomerGroup = {
  name: string;
  phone: string | null;
  email: string | null;
  deliveries: DebtorsViewRow[];
};

export function DebtorsExplorer({ rows }: { rows: DebtorsViewRow[] }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [printCustomerId, setPrintCustomerId] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<MarkPaidTarget | null>(null);
  const router = useRouter();

  const byCustomer = new Map<string, CustomerGroup>();

  for (const r of rows) {
    let g = byCustomer.get(r.customer_id);
    if (!g) {
      g = {
        name: r.customer_name,
        phone: r.customer_phone,
        email: r.customer_email,
        deliveries: [],
      };
      byCustomer.set(r.customer_id, g);
    }
    g.deliveries.push(r);
  }

  const printGroup = printCustomerId
    ? byCustomer.get(printCustomerId)
    : undefined;

  return (
    <div className="flex flex-col gap-3 p-4 md:p-6">
      {[...byCustomer.entries()].map(([cid, g]) => {
        const total = g.deliveries.reduce((s, d) => s + Number(d.balance), 0);
        const paidSoFar = g.deliveries.reduce((s, d) => s + Number(d.amount_paid ?? 0), 0);
        const nearestDue = g.deliveries
          .map((d) => d.payment_due_date)
          .filter(Boolean)
          .sort()[0];

        return (
          <Collapsible
            key={cid}
            defaultOpen
            className="group/collapsible rounded-lg border border-border bg-card"
          >
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <CollapsibleTrigger className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-start hover:opacity-80">
                <ChevronDown className="size-4 shrink-0 transition-transform duration-200 ease-out-strong group-data-[state=open]/collapsible:rotate-180" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-card-foreground">{g.name}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {g.phone ?? ""} {g.email ?? ""}
                  </p>
                </div>
                <div className="text-end text-sm">
                  <p className="font-medium tabular-nums">
                    <span className="text-muted-foreground text-xs font-normal">יתרה לגבייה </span>
                    {formatIls(total)}
                  </p>
                  {paidSoFar > 0 ? (
                    <p className="text-muted-foreground text-xs tabular-nums">
                      כבר שולמו {formatIls(paidSoFar)}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground text-xs">
                    {g.deliveries.length} תעודות · יעד קרוב{" "}
                    <span
                      className={cn(
                        "tabular-nums",
                        isPastDue(nearestDue) && "font-medium text-destructive"
                      )}
                    >
                      {formatDateShort(nearestDue)}
                    </span>
                  </p>
                </div>
              </CollapsibleTrigger>
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={`/dashboard/payments/new?customer=${cid}`}>
                  <Wallet data-icon="inline-start" />
                  רישום תשלום ללקוח
                </Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPrintCustomerId(cid)}
              >
                <Printer data-icon="inline-start" />
                הדפסה
              </Button>
            </div>
            <CollapsibleContent>
              <ul className="flex flex-col gap-2 border-t border-border px-4 py-3">
                {g.deliveries.map((d) => (
                  <li
                    key={d.delivery_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <div className="flex flex-col gap-0.5">
                      <Link
                        href={`/dashboard/deliveries/${d.delivery_id}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        משלוח #{d.delivery_number} · הזמנה #{d.order_number}
                      </Link>
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          isPastDue(d.payment_due_date)
                            ? "font-medium text-destructive"
                            : "text-muted-foreground"
                        )}
                      >
                        יעד תשלום: {formatDateShort(d.payment_due_date)}
                        {isPastDue(d.payment_due_date) ? " · באיחור" : ""}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="tabular-nums font-medium">
                          <span className="text-muted-foreground text-xs font-normal">יתרה </span>
                          {formatIls(Number(d.balance))}
                        </span>
                        {Number(d.amount_paid) > 0 ? (
                          <span className="text-muted-foreground text-xs tabular-nums">
                            שולם {formatIls(Number(d.amount_paid))} מתוך{" "}
                            {formatIls(Number(d.total))}
                          </span>
                        ) : null}
                      </div>
                      <Button size="sm" type="button" asChild>
                        <Link
                          href={`/dashboard/payments/new?customer=${d.customer_id}&delivery=${d.delivery_id}`}
                          aria-label={`רישום תשלום לתעודה #${d.delivery_number}`}
                        >
                          רישום תשלום
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        aria-label={`סמן כשולם במלואו — תעודה #${d.delivery_number}`}
                        onClick={() =>
                          setPayTarget({
                            delivery_id: d.delivery_id,
                            delivery_number: d.delivery_number,
                            customer_name: d.customer_name,
                            balance: Number(d.balance),
                          })
                        }
                      >
                        סמן כשולם במלואו
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
      {rows.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground text-sm">
          אין חובות פתוחים לפי תעודות משלוח.
        </p>
      ) : null}
      {printCustomerId && printGroup ? (
      <DebtorPrintDialog
        key={printCustomerId}
        open
        onOpenChange={(open) => {
          if (!open) setPrintCustomerId(null);
        }}
        customerName={printGroup?.name ?? ""}
        deliveries={printGroup?.deliveries ?? []}
        onError={setErrorMessage}
      />
      ) : null}
      {payTarget ? (
        <MarkPaidDialog
          key={payTarget.delivery_id}
          target={payTarget}
          onOpenChange={(open) => {
            if (!open) setPayTarget(null);
          }}
          onDone={() => router.refresh()}
        />
      ) : null}
      <ErrorDialog
        message={errorMessage}
        onClose={() => setErrorMessage(null)}
      />
    </div>
  );
}
