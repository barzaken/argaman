"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, Loader2, Paperclip, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
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
import { formatDateShort, formatIlsDense } from "@/lib/db/format";
import { expenseCategoryLabels, expenseDocumentTypeLabels } from "@/lib/db/labels";
import type { ExpenseDocumentTypeDb } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import {
  getExpenseDialogData,
  listExpenseClassifications,
  pushExpenseToGreenInvoice,
  type ExpenseDialogData,
} from "@/app/dashboard/green-invoice/actions";
import type { GiAccountingClassification } from "@/lib/green-invoice/mappers";
import {
  GiEnvBadge,
  GiField,
  GiNotConnectedLink,
  GiNotice,
  SummaryRow,
  toastFailure,
} from "@/components/green-invoice/shared";

/**
 * "שליחה ל-Green Invoice" להוצאה: בחירת סיווג הנהלת חשבונות (רשימה מ-Green Invoice) → אישור →
 * POST /expenses, ואם להוצאה יש מסמך עם קובץ ב-Storage — הקובץ מצורף (presigned upload).
 *
 * @param expenseId  expenses.id / expenses_view.id
 * @param hasExpense !!expenses_view.green_invoice_expense_id
 * @param configured אופציונלי: isGreenInvoiceConfigured() מצד השרת. false → קישור "לא מחובר".
 */
export function GreenInvoiceExpenseButton({
  expenseId,
  hasExpense = false,
  configured,
  size = "sm",
  className,
}: {
  expenseId: string;
  hasExpense?: boolean;
  configured?: boolean;
  size?: "xs" | "sm" | "default";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (hasExpense) {
    return (
      <Badge
        variant="outline"
        className={cn("border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", className)}
      >
        נשלח ל-Green Invoice
      </Badge>
    );
  }
  if (configured === false) return <GiNotConnectedLink className={className} />;
  return (
    <>
      <Button type="button" variant="outline" size={size} className={className} onClick={() => setOpen(true)}>
        <CloudUpload aria-hidden />
        שליחה ל-Green Invoice
      </Button>
      {open ? <ExpenseDialog expenseId={expenseId} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}

function ExpenseDialog({
  expenseId,
  open,
  onOpenChange,
}: {
  expenseId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<ExpenseDialogData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [classes, setClasses] = useState<GiAccountingClassification[] | null>(null);
  const [classesError, setClassesError] = useState<string | null>(null);
  const [classesLoading, setClassesLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [classificationId, setClassificationId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function loadClasses(refresh = false) {
    setClassesLoading(true);
    setClassesError(null);
    const res = await listExpenseClassifications({ refresh }).catch(actionCrashed);
    setClassesLoading(false);
    if (!res.ok) {
      setClassesError(res.message);
      return;
    }
    setClasses(res.items);
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getExpenseDialogData(expenseId).catch(actionCrashed);
      if (!alive) return;
      if (!res.ok) {
        setLoadError(res.message);
        return;
      }
      setData(res.data);
      if (res.data.configured && !res.data.existingId) {
        setClassesLoading(true);
        const cl = await listExpenseClassifications().catch(actionCrashed);
        if (!alive) return;
        setClassesLoading(false);
        if (cl.ok) setClasses(cl.items);
        else setClassesError(cl.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [expenseId]);

  const filtered = useMemo(() => {
    const q = filter.trim();
    const list = classes ?? [];
    if (!q) return list;
    return list.filter((c) => c.title.includes(q) || (c.code ?? "").includes(q) || (c.key ?? "").includes(q));
  }, [classes, filter]);

  const selected = classes?.find((c) => c.id === classificationId) ?? null;
  const canPush = !!data && data.configured && !data.existingId && !data.inProgress && !data.blocker;

  async function push(): Promise<boolean> {
    const res = await pushExpenseToGreenInvoice(expenseId, { classificationId }).catch(actionCrashed);
    if (!res.ok) {
      toastFailure(res);
      if ("code" in res && (res.code === "already_issued" || res.code === "ambiguous")) {
        onOpenChange(false);
        router.refresh();
      }
      return false;
    }
    toast.success(res.message, { duration: 8000 });
    if (res.warning) toast.warning(res.warning, { duration: 15_000 });
    onOpenChange(false);
    router.refresh();
    return true;
  }

  const e = data?.expense;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            שליחת הוצאה ל-Green Invoice
            {data ? <GiEnvBadge env={data.env} /> : null}
          </DialogTitle>
          <DialogDescription>
            {e ? `${e.supplierName ?? "ללא ספק"} · מסמך ${e.documentNumber ?? "—"}` : "טוען פרטי הוצאה…"}
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : !data || !e ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            טוען…
          </div>
        ) : !data.configured ? (
          <GiNotConnectedLink className="py-4 text-sm" />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border p-3 text-sm">
              <SummaryRow
                label="סוג מסמך"
                value={expenseDocumentTypeLabels[e.documentType as ExpenseDocumentTypeDb] ?? String(e.documentType)}
              />
              <SummaryRow label="תאריך" value={formatDateShort(e.expenseDate)} />
              <SummaryRow label="קטגוריה" value={expenseCategoryLabels[e.category]} />
              {e.vatAmount !== null ? <SummaryRow label="מע״מ" value={formatIlsDense(e.vatAmount)} /> : null}
              <SummaryRow label="סה״כ" value={formatIlsDense(e.amountTotal)} strong />
            </div>

            {data.existingId ? (
              <GiNotice>ההוצאה כבר נשלחה ל-Green Invoice — לא שולחים פעמיים.</GiNotice>
            ) : data.inProgress ? (
              <GiNotice>שליחת ההוצאה כבר מתבצעת. רעננו את הדף בעוד רגע.</GiNotice>
            ) : data.blocker ? (
              <GiNotice>{data.blocker}</GiNotice>
            ) : (
              <>
                {data.recovering ? (
                  <GiNotice>
                    ניסיון שליחה קודם לא הסתיים. בשליחה הבאה המערכת תבדוק קודם ב-Green Invoice אם ההוצאה כבר נוצרה.
                  </GiNotice>
                ) : null}
                <div className="flex flex-col gap-2">
                  <div className="flex items-end gap-2">
                    <GiField label="סיווג הנהלת חשבונות" className="flex-1">
                      <Select value={classificationId} onValueChange={setClassificationId} dir="rtl">
                        <SelectTrigger className="w-full" disabled={!classes?.length}>
                          <SelectValue placeholder={classesLoading ? "טוען סיווגים…" : "בחרו סיווג"} />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {filtered.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.code ? `${c.code} · ` : ""}
                              {c.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </GiField>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="רענון רשימת הסיווגים"
                      disabled={classesLoading}
                      onClick={() => void loadClasses(true)}
                    >
                      <RefreshCw className={cn(classesLoading && "animate-spin")} aria-hidden />
                    </Button>
                  </div>
                  {(classes?.length ?? 0) > 12 ? (
                    <GiField label="סינון סיווגים">
                      <Input value={filter} onChange={(ev) => setFilter(ev.target.value)} placeholder="למשל: דלק, 1300" />
                    </GiField>
                  ) : null}
                  {classesError ? <p className="text-xs text-destructive">{classesError}</p> : null}
                </div>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Paperclip className="size-3.5" aria-hidden />
                  {data.hasFile
                    ? `הקובץ "${data.fileName ?? "מסמך"}" יצורף להוצאה ב-Green Invoice`
                    : "אין קובץ מצורף להוצאה — אפשר לצרף אחר כך ב-Green Invoice"}
                </p>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            סגירה
          </Button>
          {canPush ? (
            <Button type="button" disabled={!classificationId} onClick={() => setConfirmOpen(true)}>
              <CloudUpload aria-hidden />
              שליחה
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="לשלוח את ההוצאה ל-Green Invoice?"
        description={`ההוצאה (${e ? formatIlsDense(e.amountTotal) : ""}) תירשם בדו״ח ההוצאות בסיווג "${selected?.title ?? ""}".${
          data?.env === "sandbox" ? " (סביבת בדיקות)" : ""
        }`}
        confirmLabel="שליחה"
        pendingLabel="שולח…"
        onConfirm={push}
      />
    </Dialog>
  );
}
