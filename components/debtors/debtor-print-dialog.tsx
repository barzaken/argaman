"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Printer } from "lucide-react";

import {
  getDebtorPrintData,
  type DebtorPrintData,
} from "@/app/dashboard/debtors/actions";
import { DebtorSummaryDocumentSheet } from "@/components/debtors/debtor-summary-document-sheet";
import { DeliveryDocumentSheet } from "@/components/deliveries/delivery-document-sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DebtorsViewRow } from "@/lib/db/types";
import { formatDateShort, formatIls } from "@/lib/db/format";
import {
  downloadDebtorSummaryPdf,
  printDocuments,
} from "@/lib/orders/document-export";

type ExportMode = "print" | "download";

export function DebtorPrintDialog({
  open,
  onOpenChange,
  customerName,
  deliveries,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  deliveries: DebtorsViewRow[];
  onError: (message: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(deliveries.map((d) => d.delivery_id))
  );
  const [busyMode, setBusyMode] = useState<ExportMode | null>(null);
  const [printData, setPrintData] = useState<DebtorPrintData | null>(null);
  const bundleRef = useRef<HTMLDivElement>(null);
  const pendingModeRef = useRef<ExportMode | null>(null);

  // ההורה מרכיב את הדיאלוג מחדש (key) לכל לקוח — אין צורך באיפוס ב-effect.
  // שומרים את ה-callbacks ב-ref כדי שרינדור של ההורה לא יבטל ייצוא באמצע.
  const onOpenChangeRef = useRef(onOpenChange);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    const mode = pendingModeRef.current;
    if (!printData || !mode) return;

    let cancelled = false;

    async function runExport() {
      const root = bundleRef.current;
      const sheets = root
        ? ([...root.querySelectorAll(".ods-sheet")] as HTMLElement[])
        : [];

      if (sheets.length === 0) {
        pendingModeRef.current = null;
        setBusyMode(null);
        setPrintData(null);
        onErrorRef.current("לא ניתן להכין את המסמך");
        return;
      }

      try {
        if (mode === "print") {
          await printDocuments(sheets);
        } else {
          await downloadDebtorSummaryPdf(sheets, customerName);
        }
        if (!cancelled) onOpenChangeRef.current(false);
      } catch {
        if (!cancelled) {
          onErrorRef.current(
            mode === "print"
              ? "שגיאה בהדפסה. נסו שוב."
              : "שגיאה בהורדת PDF. נסו שוב."
          );
        }
      } finally {
        pendingModeRef.current = null;
        if (!cancelled) {
          setBusyMode(null);
          setPrintData(null);
        }
      }
    }

    const id = window.requestAnimationFrame(() => {
      void runExport();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
  }, [printData, customerName]);

  const busy = busyMode !== null;

  const selectedTotal = deliveries
    .filter((d) => selected.has(d.delivery_id))
    .reduce((s, d) => s + Number(d.balance), 0);

  function toggle(id: string, checked: boolean | "indeterminate") {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked === true) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean | "indeterminate") {
    if (checked === true) {
      setSelected(new Set(deliveries.map((d) => d.delivery_id)));
    } else {
      setSelected(new Set());
    }
  }

  const allSelected =
    deliveries.length > 0 && selected.size === deliveries.length;
  const someSelected = selected.size > 0 && selected.size < deliveries.length;

  async function startExport(mode: ExportMode) {
    if (selected.size === 0) {
      onError("יש לבחור לפחות תעודה אחת");
      return;
    }

    setBusyMode(mode);
    try {
      const res = await getDebtorPrintData([...selected]);
      if (!res.ok) {
        onError(res.message);
        setBusyMode(null);
        return;
      }

      pendingModeRef.current = mode;
      setPrintData(res.data);
    } catch {
      setBusyMode(null);
      onError("שגיאה בהכנת המסמך. נסו שוב.");
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) onOpenChange(next);
        }}
      >
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>סיכום חוב</DialogTitle>
            <DialogDescription>
              בחרו אילו תעודות משלוח לכלול במסמך הסיכום עבור {customerName}. לכל
              תעודה שנבחרה יצורף גם עמוד תעודת משלוח מלאה.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <Checkbox
                checked={
                  allSelected ? true : someSelected ? "indeterminate" : false
                }
                onCheckedChange={toggleAll}
                disabled={busy}
              />
              <span className="font-medium">בחר הכל</span>
            </label>

            <ul className="flex max-h-64 flex-col gap-2 overflow-auto">
              {deliveries.map((d) => (
                <li key={d.delivery_id}>
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/40">
                    <span className="flex min-w-0 items-center gap-3">
                      <Checkbox
                        checked={selected.has(d.delivery_id)}
                        onCheckedChange={(c) => toggle(d.delivery_id, c)}
                        disabled={busy}
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium">
                          משלוח #{d.delivery_number} · הזמנה #{d.order_number}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          יעד תשלום: {formatDateShort(d.payment_due_date)}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="tabular-nums font-medium">
                        {formatIls(Number(d.balance))}
                      </span>
                      {Number(d.amount_paid) > 0 ? (
                        <span className="text-muted-foreground text-xs tabular-nums">
                          שולם {formatIls(Number(d.amount_paid))} מתוך{" "}
                          {formatIls(Number(d.total))}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">
                {selected.size} נבחרו · יתרה לתשלום
              </span>
              <span className="tabular-nums font-semibold">
                {formatIls(selectedTotal)}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              ביטול
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || selected.size === 0}
              onClick={() => void startExport("download")}
            >
              <Download data-icon="inline-start" />
              {busyMode === "download" ? "מוריד…" : "הורדת PDF"}
            </Button>
            <Button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => void startExport("print")}
            >
              <Printer data-icon="inline-start" />
              {busyMode === "print" ? "מדפיס…" : "הדפסה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {printData ? (
        <div
          ref={bundleRef}
          aria-hidden
          className="pointer-events-none fixed -left-[10000px] top-0 z-[-1] flex w-[210mm] flex-col gap-0 overflow-visible"
        >
          <DebtorSummaryDocumentSheet data={printData} />
          {printData.deliveryDocs.map(({ delivery, lines }) => (
            <DeliveryDocumentSheet
              key={delivery.id}
              delivery={delivery}
              lines={lines}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
