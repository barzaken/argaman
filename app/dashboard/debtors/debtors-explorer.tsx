"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Printer } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import type { DebtorsViewRow } from "@/lib/db/types";
import { formatIls } from "@/lib/db/format";
import { markDeliveryPaid } from "@/app/dashboard/deliveries/actions";
import { ErrorDialog } from "@/components/error-dialog";
import { DebtorPrintDialog } from "@/components/debtors/debtor-print-dialog";

type CustomerGroup = {
  name: string;
  phone: string | null;
  email: string | null;
  deliveries: DebtorsViewRow[];
};

export function DebtorsExplorer({ rows }: { rows: DebtorsViewRow[] }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [printCustomerId, setPrintCustomerId] = useState<string | null>(null);

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
        const total = g.deliveries.reduce((s, d) => s + Number(d.total), 0);
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
                <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-card-foreground">{g.name}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {g.phone ?? ""} {g.email ?? ""}
                  </p>
                </div>
                <div className="text-end text-sm">
                  <p className="font-medium tabular-nums">{formatIls(total)}</p>
                  <p className="text-muted-foreground text-xs">
                    {g.deliveries.length} תעודות · יעד קרוב {nearestDue ?? "—"}
                  </p>
                </div>
              </CollapsibleTrigger>
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
                      <span className="text-muted-foreground text-xs">
                        יעד תשלום: {d.payment_due_date ?? "—"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums font-medium">
                        {formatIls(Number(d.total))}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={async () => {
                          const res = await markDeliveryPaid(d.delivery_id);
                          if (!res.ok) setErrorMessage(res.message);
                          else window.location.reload();
                        }}
                      >
                        סמן כשולם
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
      <DebtorPrintDialog
        open={printCustomerId !== null && !!printGroup}
        onOpenChange={(open) => {
          if (!open) setPrintCustomerId(null);
        }}
        customerName={printGroup?.name ?? ""}
        deliveries={printGroup?.deliveries ?? []}
        onError={setErrorMessage}
      />
      <ErrorDialog
        message={errorMessage}
        onClose={() => setErrorMessage(null)}
      />
    </div>
  );
}
