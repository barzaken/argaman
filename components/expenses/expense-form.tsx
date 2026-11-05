"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import { createExpense, updateExpense, type ExpenseInput } from "@/app/dashboard/expenses/actions";
import {
  FormPageShell,
  FormStickyFooter,
} from "@/components/form-sticky-footer";
import {
  SupplierPicker,
  matchSupplierByTaxId,
  type SupplierOption,
} from "@/components/suppliers/supplier-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { actionCrashed } from "@/lib/action-client";
import { normalizeDecimalInput, roundMoney } from "@/lib/db/calculations";
import { formatDateShort, formatIlsDense, todayIsoInIsrael } from "@/lib/db/format";
import {
  documentKindLabels,
  documentStatusLabels,
  expenseCategoryOptions,
  expenseDocumentTypeOptions,
  paymentMethodOptions,
} from "@/lib/db/labels";
import type {
  DocumentViewRow,
  ExpenseCategoryDb,
  ExpenseDocumentTypeDb,
  ExpenseViewRow,
  PaymentMethodDb,
} from "@/lib/db/types";
import { cn } from "@/lib/utils";

const VAT_RATE = 0.18;

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // <label> עוטף את השדה — שם נגיש לקורא מסך ולחיצה על הכותרת מפעילה את השדה
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

const numStr = (n: number | null | undefined) => (n == null ? "" : String(n));
const parseNum = (s: string): number | null => {
  const n = s.trim() === "" ? NaN : parseFloat(normalizeDecimalInput(s));
  return Number.isFinite(n) ? n : null;
};

function defaultDocType(doc: DocumentViewRow | null | undefined): ExpenseDocumentTypeDb {
  const gi = doc?.green_invoice_type;
  if (gi != null && [20, 305, 320, 330, 400, 405].includes(gi)) {
    return gi as ExpenseDocumentTypeDb;
  }
  switch (doc?.kind) {
    case "supplier_receipt":
      return 400;
    case "expense_receipt":
      return 320;
    default:
      return 305;
  }
}

export function ExpenseForm({
  suppliers,
  expense,
  sourceDocument,
  defaultSupplierId,
  existingExpenseIdForDocument,
  header,
}: {
  suppliers: SupplierOption[];
  /** עריכה */
  expense?: ExpenseViewRow;
  /** מסמך מקור (?document= או המסמך המקושר) */
  sourceDocument?: DocumentViewRow | null;
  /** ?supplier= */
  defaultSupplierId?: string | null;
  /** המסמך כבר מקושר להוצאה אחרת */
  existingExpenseIdForDocument?: string | null;
  header?: React.ReactNode;
}) {
  const router = useRouter();
  const isEdit = Boolean(expense);
  const doc = sourceDocument ?? null;
  const prefillFromDoc = !isEdit && doc;

  const initialSupplierId =
    expense?.supplier_id ??
    (prefillFromDoc ? doc.supplier_id : null) ??
    (prefillFromDoc ? matchSupplierByTaxId(suppliers, doc.counterparty_tax_id)?.id : null) ??
    defaultSupplierId ??
    null;

  const initialDate =
    expense?.expense_date ?? (prefillFromDoc ? doc.document_date : null) ?? todayIsoInIsrael();

  const [supplierId, setSupplierId] = useState<string | null>(initialSupplierId);
  const [category, setCategory] = useState<ExpenseCategoryDb | "">(expense?.category ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [expenseDate, setExpenseDate] = useState(initialDate);
  const [reportingMonth, setReportingMonth] = useState(
    expense?.reporting_month?.slice(0, 7) ?? initialDate.slice(0, 7)
  );
  const [reportingMonthTouched, setReportingMonthTouched] = useState(
    Boolean(expense?.reporting_month)
  );
  const [documentType, setDocumentType] = useState<ExpenseDocumentTypeDb>(
    expense?.document_type ?? defaultDocType(doc)
  );
  const [documentNumber, setDocumentNumber] = useState(
    expense?.document_number ?? (prefillFromDoc ? doc.document_number ?? "" : "")
  );
  const [beforeVat, setBeforeVat] = useState(
    numStr(expense ? expense.amount_before_vat : prefillFromDoc ? doc.amount_before_vat : null)
  );
  const [vat, setVat] = useState(
    numStr(expense ? expense.vat_amount : prefillFromDoc ? doc.vat_amount : null)
  );
  const [total, setTotal] = useState(
    numStr(expense ? expense.amount_total : prefillFromDoc ? doc.amount_total : null)
  );
  const [currency, setCurrency] = useState(
    expense?.currency ?? (prefillFromDoc ? doc.currency : null) ?? "ILS"
  );
  const [isPaid, setIsPaid] = useState(
    expense?.is_paid ?? (prefillFromDoc ? doc.kind === "expense_receipt" || doc.kind === "supplier_receipt" : false)
  );
  const [paidAt, setPaidAt] = useState(expense?.paid_at ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodDb | "">(
    expense?.payment_method ?? ""
  );
  const [notes, setNotes] = useState(expense?.notes ?? "");

  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const amounts = useMemo(() => {
    const b = parseNum(beforeVat);
    const v = parseNum(vat);
    const t = parseNum(total);
    const mismatch =
      b != null && v != null && t != null && Math.abs(b + v - t) > 0.05
        ? roundMoney(b + v)
        : null;
    const canFill =
      (t == null && b != null) ||
      (b == null && t != null) ||
      (v == null && b != null && t != null);
    return { b, v, t, mismatch, canFill };
  }, [beforeVat, vat, total]);

  /** משלים את הסכום החסר לפי מע״מ 18% */
  function fillVat() {
    const { b, v, t } = amounts;
    if (b != null && t == null) {
      const vv = v ?? roundMoney(b * VAT_RATE);
      setVat(String(vv));
      setTotal(String(roundMoney(b + vv)));
    } else if (t != null && b == null) {
      if (v != null) {
        setBeforeVat(String(roundMoney(t - v)));
      } else {
        const bb = roundMoney(t / (1 + VAT_RATE));
        setBeforeVat(String(bb));
        setVat(String(roundMoney(t - bb)));
      }
    } else if (b != null && t != null && v == null) {
      setVat(String(roundMoney(t - b)));
    }
  }

  function handleExpenseDateChange(next: string) {
    setExpenseDate(next);
    if (!reportingMonthTouched && /^\d{4}-\d{2}/.test(next)) {
      setReportingMonth(next.slice(0, 7));
    }
  }

  const blockedByDocument = Boolean(existingExpenseIdForDocument) && !isEdit;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExistingId(null);
    if (!category) {
      setError("יש לבחור קטגוריה");
      toast.error("יש לבחור קטגוריה");
      return;
    }
    if (amounts.mismatch != null) {
      const msg = `הסכומים לא מסתדרים: לפני מע״מ + מע״מ = ${amounts.mismatch.toFixed(2)}, אבל הסכום הכולל הוא ${amounts.t?.toFixed(2)}`;
      setError(msg);
      toast.error(msg);
      return;
    }
    setPending(true);
    const payload: ExpenseInput = {
      supplier_id: supplierId,
      category,
      description: description || null,
      expense_date: expenseDate,
      reporting_month: reportingMonth || null,
      document_type: documentType,
      document_number: documentNumber.trim() || null,
      amount_before_vat: beforeVat.trim() ? normalizeDecimalInput(beforeVat) : null,
      vat_amount: vat.trim() ? normalizeDecimalInput(vat) : null,
      amount_total: normalizeDecimalInput(total),
      currency: currency || "ILS",
      is_paid: isPaid,
      paid_at: isPaid ? paidAt || null : null,
      payment_method: isPaid ? paymentMethod || null : null,
      notes: notes || null,
      document_id: expense?.document_id ?? doc?.id ?? null,
    };
    const res = await (expense ? updateExpense(expense.id, payload) : createExpense(payload)).catch(
      actionCrashed
    );
    if (!res.ok) {
      setPending(false);
      setError(res.message);
      if ("existingId" in res && res.existingId) setExistingId(res.existingId);
      toast.error(res.message);
      return;
    }
    toast.success(isEdit ? "ההוצאה עודכנה" : "ההוצאה נשמרה");
    if (isEdit) {
      setPending(false);
      router.refresh();
    } else {
      router.push(`/dashboard/expenses/${res.id}`);
    }
  }

  return (
    <FormPageShell>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {header}
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-8">
            {!isEdit ? (
              <div>
                <h2 className="text-lg font-semibold text-foreground">הוצאה חדשה</h2>
                <p className="text-muted-foreground text-sm">
                  חשבונית ספק, קבלה על דלק, הובלה, תחזוקה וכו׳
                </p>
              </div>
            ) : null}

            {doc ? (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" aria-hidden />
                  <span className="font-medium">
                    מסמך מקור: {documentKindLabels[doc.kind]}
                    {doc.document_number ? ` #${doc.document_number}` : ""}
                  </span>
                  <Badge variant="outline" className="font-normal">
                    {documentStatusLabels[doc.status]}
                  </Badge>
                  <Link
                    href={`/dashboard/documents/${doc.id}`}
                    className="ms-auto text-xs underline underline-offset-4"
                    target="_blank"
                  >
                    פתיחת המסמך
                  </Link>
                </div>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {doc.counterparty_name ?? doc.supplier_name ?? "—"}
                  {doc.counterparty_tax_id ? ` · ח.פ ${doc.counterparty_tax_id}` : ""} · תאריך{" "}
                  {formatDateShort(doc.document_date)} · סכום{" "}
                  {doc.amount_total != null ? formatIlsDense(Number(doc.amount_total)) : "—"}
                </p>
                {prefillFromDoc ? (
                  <p className="text-muted-foreground text-xs">
                    הפרטים מולאו מהמסמך — בדקו אותם לפני השמירה. בשמירה המסמך יקושר להוצאה ויסומן ״טופל״.
                  </p>
                ) : null}
              </div>
            ) : null}

            {blockedByDocument ? (
              <div
                className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
                role="alert"
              >
                <span className="text-destructive">המסמך הזה כבר נרשם כהוצאה.</span>{" "}
                <Link
                  href={`/dashboard/expenses/${existingExpenseIdForDocument}`}
                  className="font-medium underline underline-offset-4"
                >
                  מעבר להוצאה הקיימת
                </Link>
              </div>
            ) : null}

            <section className="flex flex-col gap-4">
              <SectionTitle>ספק</SectionTitle>
              <SupplierPicker
                suppliers={suppliers}
                value={supplierId}
                onChange={setSupplierId}
                initialSearch={prefillFromDoc && !initialSupplierId ? doc.counterparty_tax_id ?? "" : ""}
                newSupplierDefaults={
                  prefillFromDoc
                    ? { name: doc.counterparty_name, tax_id: doc.counterparty_tax_id }
                    : undefined
                }
              />
            </section>

            <Separator />

            <section className="flex flex-col gap-4">
              <SectionTitle>פרטי ההוצאה</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="קטגוריה">
                  <Select
                    dir="rtl"
                    value={category || undefined}
                    onValueChange={(v) => v && setCategory(v as ExpenseCategoryDb)}
                  >
                    <SelectTrigger className="w-full" aria-label="קטגוריה">
                      <SelectValue placeholder="בחרו קטגוריה" />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {expenseCategoryOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="תיאור">
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="למשל: סולר למשאית"
                  />
                </Field>
                <Field label="תאריך ההוצאה (תאריך המסמך)">
                  <Input
                    type="date"
                    dir="ltr"
                    value={expenseDate}
                    onChange={(e) => handleExpenseDateChange(e.target.value)}
                    required
                  />
                </Field>
                <Field label="חודש דיווח" hint="ברירת מחדל: החודש של תאריך ההוצאה">
                  <Input
                    type="month"
                    dir="ltr"
                    value={reportingMonth}
                    onChange={(e) => {
                      setReportingMonthTouched(true);
                      setReportingMonth(e.target.value);
                    }}
                  />
                </Field>
                <Field label="סוג מסמך">
                  <Select
                    dir="rtl"
                    value={String(documentType)}
                    onValueChange={(v) => v && setDocumentType(Number(v) as ExpenseDocumentTypeDb)}
                  >
                    <SelectTrigger className="w-full" aria-label="סוג מסמך">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {expenseDocumentTypeOptions.map((o) => (
                        <SelectItem key={o.value} value={String(o.value)}>
                          {o.value} {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="מספר מסמך" hint="מספר החשבונית / הקבלה כפי שמופיע על המסמך">
                  <Input
                    dir="ltr"
                    className="text-start"
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                  />
                </Field>
              </div>
            </section>

            <Separator />

            <section className="flex flex-col gap-4">
              <SectionTitle>סכומים</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="סכום לפני מע״מ">
                  <Input
                    dir="ltr"
                    type="text"
                    inputMode="decimal"
                    className="text-start"
                    value={beforeVat}
                    onChange={(e) => setBeforeVat(e.target.value)}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="מע״מ">
                  <Input
                    dir="ltr"
                    type="text"
                    inputMode="decimal"
                    className="text-start"
                    value={vat}
                    onChange={(e) => setVat(e.target.value)}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="סכום כולל (כולל מע״מ)">
                  <Input
                    dir="ltr"
                    type="text"
                    inputMode="decimal"
                    className="text-start"
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                    placeholder="0.00"
                    required
                    aria-invalid={amounts.mismatch != null || undefined}
                  />
                </Field>
                <Field label="מטבע">
                  <Input
                    dir="ltr"
                    className="text-start uppercase"
                    maxLength={3}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!amounts.canFill}
                  onClick={fillVat}
                >
                  השלמת מע״מ 18%
                </Button>
                {amounts.mismatch != null ? (
                  <span className="text-destructive text-sm" role="alert">
                    לפני מע״מ + מע״מ = {amounts.mismatch.toFixed(2)} — לא תואם לסכום הכולל
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    מלאו סכום לפני מע״מ או סכום כולל ולחצו ״השלמת מע״מ 18%״ כדי לחשב את השאר
                  </span>
                )}
              </div>
            </section>

            <Separator />

            <section className="flex flex-col gap-4">
              <SectionTitle>תשלום</SectionTitle>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={isPaid}
                  onCheckedChange={(v) => setIsPaid(v === true)}
                  aria-label="שולם"
                />
                שולם
              </label>
              {isPaid ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="תאריך תשלום" hint="ריק = תאריך ההוצאה">
                    <Input
                      type="date"
                      dir="ltr"
                      value={paidAt}
                      onChange={(e) => setPaidAt(e.target.value)}
                    />
                  </Field>
                  <Field label="אמצעי תשלום">
                    <Select
                      dir="rtl"
                      value={paymentMethod || undefined}
                      onValueChange={(v) => v && setPaymentMethod(v as PaymentMethodDb)}
                    >
                      <SelectTrigger className="w-full" aria-label="אמצעי תשלום">
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
                  </Field>
                </div>
              ) : null}
              <Field label="הערות">
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </section>
          </div>
        </div>

        <FormStickyFooter className="md:justify-between">
          {error ? (
            <div className="flex flex-wrap items-center gap-2 text-sm md:flex-1" role="alert">
              <span className="text-destructive">{error}</span>
              {existingId ? (
                <Link
                  href={`/dashboard/expenses/${existingId}`}
                  className="font-medium underline underline-offset-4"
                >
                  מעבר להוצאה הקיימת
                </Link>
              ) : null}
            </div>
          ) : (
            <span className="hidden md:block md:flex-1" />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/dashboard/expenses")}
            >
              {isEdit ? "חזרה לרשימה" : "ביטול"}
            </Button>
            <Button type="submit" disabled={pending || blockedByDocument}>
              {pending ? "שומר…" : isEdit ? "שמירת שינויים" : "שמירת הוצאה"}
            </Button>
          </div>
        </FormStickyFooter>
      </form>
    </FormPageShell>
  );
}
