"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import { recordPayment } from "../actions";
import { AllocationEditor } from "@/components/payments/allocation-editor";
import {
  checkAllocations,
  parseMoneyInput,
  round2,
  type OpenDelivery,
} from "@/components/payments/allocation-utils";
import {
  CustomerPicker,
  type PickerCustomer,
} from "@/components/payments/customer-picker";
import { PaymentSummary } from "@/components/payments/payment-summary";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { actionCrashed } from "@/lib/action-client";
import { normalizeDecimalInput } from "@/lib/db/calculations";
import { formatDateShort, formatIls } from "@/lib/db/format";
import {
  documentKindLabels,
  documentStatusLabels,
  paymentMethodOptions,
} from "@/lib/db/labels";
import type {
  DocumentKindDb,
  DocumentStatusDb,
  PaymentMethodDb,
} from "@/lib/db/types";
import { cn } from "@/lib/utils";

export type LinkedDocumentInfo = {
  id: string;
  kind: DocumentKindDb;
  status: DocumentStatusDb;
  document_number: string | null;
  document_date: string | null;
  amount_total: number | null;
  customer_id: string | null;
  counterparty_name: string | null;
  counterparty_tax_id: string | null;
  payment_id: string | null;
  payment_number: number | null;
};

function Field({
  label,
  children,
  className,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: React.ReactNode;
}) {
  return (
    // <label> עוטף את השדה — שם נגיש לקורא מסך ולחיצה על הכותרת מפעילה את השדה
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint}
    </label>
  );
}

function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <span className="text-destructive text-xs" role="alert">
      {message}
    </span>
  );
}

export function NewPaymentForm({
  customers,
  openDeliveries,
  creditByCustomer,
  linkedDocument,
  documentNotFound,
  initial,
}: {
  customers: PickerCustomer[];
  openDeliveries: OpenDelivery[];
  creditByCustomer: Record<string, number>;
  linkedDocument: LinkedDocumentInfo | null;
  documentNotFound: boolean;
  initial: {
    customerId: string;
    amount: string;
    method: PaymentMethodDb | "";
    reference: string;
    paidAt: string;
    allocations: Record<string, string>;
  };
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [amountRaw, setAmountRaw] = useState(initial.amount);
  const [paidAt, setPaidAt] = useState(initial.paidAt);
  const [method, setMethod] = useState<PaymentMethodDb | "">(initial.method);
  const [reference, setReference] = useState(initial.reference);
  const [bankName, setBankName] = useState("");
  const [notes, setNotes] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>(
    initial.allocations
  );
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const customerDeliveries = useMemo(
    () => openDeliveries.filter((d) => d.customer_id === customerId),
    [openDeliveries, customerId]
  );
  const customerOpenBalance = round2(
    customerDeliveries.reduce((s, d) => s + Number(d.balance), 0)
  );
  const existingCredit = customerId ? (creditByCustomer[customerId] ?? 0) : 0;

  const amount = parseMoneyInput(amountRaw);
  const amountValid = Number.isFinite(amount) && amount > 0;
  const check = checkAllocations(customerDeliveries, allocations);
  const remaining = round2((amountValid ? amount : 0) - check.allocated);

  const errors = {
    customer: !customerId ? "יש לבחור לקוח" : null,
    amount: amountRaw.trim() === ""
      ? "יש להזין סכום תשלום"
      : !amountValid
        ? "סכום לא תקין — הזינו מספר גדול מאפס (למשל 1500 או 1,250.50)"
        : null,
    method: !method ? "יש לבחור אמצעי תשלום" : null,
    paidAt: !paidAt ? "יש להזין תאריך תשלום" : null,
    overAllocated:
      amountValid && check.allocated > amount + 0.005
        ? `סכום השיוך לתעודות (${formatIls(check.allocated)}) גדול מסכום התשלום (${formatIls(amount)}). הקטינו את השיוך או הגדילו את סכום התשלום.`
        : null,
    rows:
      Object.keys(check.rowErrors).length > 0
        ? "יש תעודות שהסכום שהוזן להן גדול מהיתרה שלהן או אינו תקין."
        : null,
  };
  const firstError =
    errors.customer ??
    errors.amount ??
    errors.method ??
    errors.paidAt ??
    errors.overAllocated ??
    errors.rows;

  function handleCustomerChange(id: string) {
    setCustomerId(id);
    setAllocations({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    if (firstError) {
      // שגיאות ולידציה מוצגות ליד השדות / בסיכום — כאן רק טוסט
      toast.error(firstError);
      return;
    }
    setPending(true);
    const res = await recordPayment({
      customer_id: customerId,
      amount: round2(amount),
      paid_at: paidAt || null,
      method: method as PaymentMethodDb,
      reference: reference.trim() || null,
      bank_name: bankName.trim() || null,
      notes: notes.trim() || null,
      document_id:
        linkedDocument && !linkedDocument.payment_id ? linkedDocument.id : null,
      allocations: check.allocations,
    }).catch(actionCrashed);
    if (!res.ok) {
      setPending(false);
      setError(res.message);
      toast.error(res.message);
      return;
    }
    toast.success(
      remaining > 0.005
        ? `התשלום נרשם. ${formatIls(remaining)} נשארו כזיכוי ללקוח.`
        : "התשלום נרשם ושויך לתעודות."
    );
    router.push(`/dashboard/payments/${res.id}`);
  }

  const docLabel = linkedDocument
    ? `${documentKindLabels[linkedDocument.kind] ?? "מסמך"}${linkedDocument.document_number ? ` #${linkedDocument.document_number}` : ""}`
    : "";

  return (
    <FormPageShell>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto flex w-full max-w-[min(100%,56rem)] flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                רישום תשלום מלקוח
              </h2>
              <p className="text-muted-foreground text-sm">
                רשמו את פרטי התשלום (מהקבלה / הצ׳ק / אישור ההעברה) ושייכו אותו
                לתעודות המשלוח שהוא משלם. מה שלא משויך יישאר כזיכוי ללקוח.
              </p>
            </div>

            {linkedDocument ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
                <div className="flex min-w-0 items-start gap-3">
                  <FileText
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      מסמך מקושר: {docLabel}
                    </p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {linkedDocument.amount_total != null
                        ? `סכום במסמך: ${formatIls(Number(linkedDocument.amount_total))}`
                        : "אין סכום במסמך"}
                      {linkedDocument.document_date
                        ? ` · תאריך: ${formatDateShort(linkedDocument.document_date)}`
                        : ""}
                      {linkedDocument.counterparty_name
                        ? ` · ${linkedDocument.counterparty_name}`
                        : ""}
                      {` · ${documentStatusLabels[linkedDocument.status]}`}
                    </p>
                    {linkedDocument.payment_id ? (
                      <p className="mt-1 text-destructive text-xs" role="alert">
                        המסמך כבר מקושר לתשלום #{linkedDocument.payment_number}.
                        התשלום החדש יירשם בלי לקשר אליו את המסמך.
                      </p>
                    ) : (
                      <p className="mt-1 text-muted-foreground text-xs">
                        בשמירה המסמך יקושר לתשלום ויסומן ״טופל״.
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/dashboard/documents/${linkedDocument.id}`}
                    target="_blank"
                  >
                    צפייה במסמך
                  </Link>
                </Button>
              </div>
            ) : documentNotFound ? (
              <p className="text-destructive text-sm" role="alert">
                המסמך שביקשתם לקשר לא נמצא. התשלום יירשם בלי מסמך מקושר.
              </p>
            ) : null}

            <CustomerPicker
              customers={customers}
              value={customerId}
              onChange={handleCustomerChange}
              disabled={pending}
              error={submitted ? errors.customer : null}
            />

            {customerId ? (
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span>
                  יתרה פתוחה בתעודות:{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {formatIls(customerOpenBalance)}
                  </span>{" "}
                  ({customerDeliveries.length} תעודות)
                </span>
                {existingCredit > 0 ? (
                  <span>
                    זיכוי קיים מתשלומים קודמים:{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {formatIls(existingCredit)}
                    </span>
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="סכום התשלום (₪)"
                hint={<FieldError message={submitted || amountRaw ? errors.amount : null} />}
              >
                <Input
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  value={amountRaw}
                  placeholder="0.00"
                  disabled={pending}
                  aria-invalid={
                    (submitted || amountRaw) && errors.amount ? true : undefined
                  }
                  onChange={(e) => setAmountRaw(e.target.value)}
                  onBlur={(e) => {
                    const v = normalizeDecimalInput(e.target.value);
                    if (v !== "NaN" && v !== e.target.value) setAmountRaw(v);
                  }}
                  className="tabular-nums"
                />
              </Field>
              <Field
                label="תאריך תשלום"
                hint={<FieldError message={submitted ? errors.paidAt : null} />}
              >
                <Input
                  type="date"
                  dir="ltr"
                  value={paidAt}
                  disabled={pending}
                  onChange={(e) => setPaidAt(e.target.value)}
                />
              </Field>
              <Field
                label="אמצעי תשלום"
                hint={<FieldError message={submitted ? errors.method : null} />}
              >
                <Select
                  dir="rtl"
                  value={method || undefined}
                  onValueChange={(v) => setMethod(v as PaymentMethodDb)}
                  disabled={pending}
                >
                  <SelectTrigger
                    aria-invalid={submitted && errors.method ? true : undefined}
                  >
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
              <Field label="אסמכתא (מס׳ צ׳ק / מס׳ העברה)">
                <Input
                  dir="ltr"
                  value={reference}
                  disabled={pending}
                  maxLength={200}
                  onChange={(e) => setReference(e.target.value)}
                />
              </Field>
              <Field label="שם הבנק">
                <Input
                  value={bankName}
                  disabled={pending}
                  maxLength={200}
                  placeholder="למשל: לאומי, הפועלים"
                  onChange={(e) => setBankName(e.target.value)}
                />
              </Field>
              <Field label="הערות" className="sm:col-span-2">
                <Textarea
                  value={notes}
                  disabled={pending}
                  maxLength={2000}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
            </div>

            <Separator />

            {customerId ? (
              <AllocationEditor
                deliveries={customerDeliveries}
                values={allocations}
                onChange={setAllocations}
                rowErrors={check.rowErrors}
                amountToAllocate={amountValid ? amount : 0}
                disabled={pending}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                בחרו לקוח כדי לראות את תעודות המשלוח הפתוחות שלו.
              </p>
            )}

            <PaymentSummary
              amount={amountValid ? amount : 0}
              allocated={check.allocated}
              overAllocatedMessage={errors.overAllocated}
            />

            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <FormStickyFooter className="justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => router.push("/dashboard/payments")}
          >
            ביטול
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "שומר…" : "שמירת תשלום"}
          </Button>
        </FormStickyFooter>
      </form>
    </FormPageShell>
  );
}
