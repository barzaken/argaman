"use client";

import Link from "next/link";
import { WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { normalizeDecimalInput } from "@/lib/db/calculations";
import { formatDateShort, formatIls, isPastDue } from "@/lib/db/format";
import { cn } from "@/lib/utils";

import {
  autoAllocate,
  sortOldestFirst,
  type OpenDelivery,
} from "./allocation-utils";

/**
 * טבלת שיוך תשלום לתעודות משלוח פתוחות: שדה "סכום לשיוך" לכל תעודה,
 * כפתור "שיוך אוטומטי (הישן קודם)" וכפתור "מלא יתרה" לכל שורה.
 */
export function AllocationEditor({
  deliveries,
  values,
  onChange,
  rowErrors,
  amountToAllocate,
  disabled,
  emptyText = "אין ללקוח תעודות משלוח פתוחות לתשלום.",
}: {
  deliveries: OpenDelivery[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  rowErrors: Record<string, string>;
  /** הסכום שאפשר לשייך (לשיוך אוטומטי) */
  amountToAllocate: number;
  disabled?: boolean;
  emptyText?: string;
}) {
  const rows = sortOldestFirst(deliveries);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-foreground">
            שיוך לתעודות משלוח פתוחות
          </h3>
          <p className="text-muted-foreground text-xs">
            רשמו כמה מהתשלום הולך לכל תעודה. אפשר לשייך חלקית — מה שלא משויך
            נשאר כזיכוי ללקוח.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || rows.length === 0 || !(amountToAllocate > 0)}
            onClick={() => onChange(autoAllocate(rows, amountToAllocate))}
          >
            <WandSparkles data-icon="inline-start" />
            שיוך אוטומטי (הישן קודם)
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || Object.keys(values).length === 0}
            onClick={() => onChange({})}
          >
            ניקוי שיוך
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border bg-card">
        <Table dir="rtl">
          <TableHeader>
            <TableRow>
              <TableHead>תעודת משלוח</TableHead>
              <TableHead>יעד תשלום</TableHead>
              <TableHead className="text-end">סכום תעודה</TableHead>
              <TableHead className="text-end">שולם</TableHead>
              <TableHead className="text-end">יתרה</TableHead>
              <TableHead className="min-w-[11rem]">סכום לשיוך</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-20 text-center text-muted-foreground"
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((d) => {
                const overdue = isPastDue(d.payment_due_date);
                const err = rowErrors[d.delivery_id];
                const balance = Number(d.balance);
                return (
                  <TableRow key={d.delivery_id} className="align-top">
                    <TableCell>
                      <Link
                        href={`/dashboard/deliveries/${d.delivery_id}`}
                        target="_blank"
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        משלוח #{d.delivery_number}
                      </Link>
                      <p className="text-muted-foreground text-xs tabular-nums">
                        הזמנה #{d.order_number}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "tabular-nums",
                          overdue && "font-medium text-destructive"
                        )}
                      >
                        {formatDateShort(d.payment_due_date)}
                        {overdue ? " · באיחור" : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatIls(Number(d.total))}
                    </TableCell>
                    <TableCell className="text-end tabular-nums text-muted-foreground">
                      {Number(d.amount_paid) > 0
                        ? formatIls(Number(d.amount_paid))
                        : "—"}
                    </TableCell>
                    <TableCell className="text-end tabular-nums font-medium">
                      {formatIls(balance)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-start gap-1.5">
                        <label className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="sr-only">
                            סכום לשיוך לתעודה #{d.delivery_number}
                          </span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            dir="ltr"
                            placeholder="0"
                            disabled={disabled}
                            aria-invalid={err ? true : undefined}
                            value={values[d.delivery_id] ?? ""}
                            onChange={(e) =>
                              onChange({
                                ...values,
                                [d.delivery_id]: e.target.value,
                              })
                            }
                            onBlur={(e) => {
                              const v = normalizeDecimalInput(e.target.value);
                              if (v !== "NaN" && v !== e.target.value) {
                                onChange({ ...values, [d.delivery_id]: v });
                              }
                            }}
                            className="h-8 tabular-nums"
                          />
                          {err ? (
                            <span
                              className="text-destructive text-xs"
                              role="alert"
                            >
                              {err}
                            </span>
                          ) : null}
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={disabled}
                          aria-label={`מלא יתרה לתעודה #${d.delivery_number}`}
                          onClick={() =>
                            onChange({
                              ...values,
                              [d.delivery_id]: balance.toFixed(2),
                            })
                          }
                        >
                          מלא יתרה
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
