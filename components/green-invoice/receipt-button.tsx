"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, FileCheck2, Loader2, ReceiptText } from "lucide-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { Input } from "@/components/ui/input";
import { actionCrashed } from "@/lib/action-client";
import { formatDateShort, formatIlsDense } from "@/lib/db/format";
import { paymentMethodLabels } from "@/lib/db/labels";
import { cn } from "@/lib/utils";
import {
  getReceiptDialogData,
  issueReceiptForPayment,
  previewReceiptForPayment,
  type ReceiptDialogData,
} from "@/app/dashboard/green-invoice/actions";
import {
  GiDocumentLinkButton,
  GiEnvBadge,
  GiField,
  GiNotConnectedLink,
  GiNotice,
  GiPdfPreview,
  SummaryRow,
  toastFailure,
  toastIssued,
} from "@/components/green-invoice/shared";

/**
 * כפתור "הפקת קבלה" (400) ב-Green Invoice לתשלום. הקבלה מקושרת (linkType "link") לחשבוניות
 * של התעודות שהתשלום הוקצה להן; תעודה עם חשבונית מס/קבלה (320) חוסמת — התשלום כבר מתועד בה.
 *
 * @param paymentId  payments.id / payments_view.id
 * @param hasReceipt !!payments_view.green_invoice_receipt_id
 * @param greenInvoiceUrl payments_view.green_invoice_url
 * @param configured אופציונלי: isGreenInvoiceConfigured() מצד השרת. false → קישור "לא מחובר".
 */
export function GreenInvoiceReceiptButton({
  paymentId,
  hasReceipt = false,
  greenInvoiceUrl = null,
  configured,
  size = "sm",
  className,
}: {
  paymentId: string;
  hasReceipt?: boolean;
  greenInvoiceUrl?: string | null;
  configured?: boolean;
  size?: "xs" | "sm" | "default";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (hasReceipt && greenInvoiceUrl) {
    return <GiDocumentLinkButton url={greenInvoiceUrl} label="קבלה" size={size} className={className} />;
  }
  if (configured === false && !hasReceipt) return <GiNotConnectedLink className={className} />;

  return (
    <>
      <Button type="button" variant="outline" size={size} className={className} onClick={() => setOpen(true)}>
        {hasReceipt ? <FileCheck2 aria-hidden /> : <ReceiptText aria-hidden />}
        {hasReceipt ? "קבלה הופקה" : "הפקת קבלה"}
      </Button>
      {open ? <ReceiptDialog paymentId={paymentId} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}

function ReceiptDialog({
  paymentId,
  open,
  onOpenChange,
}: {
  paymentId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<ReceiptDialogData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendEmail, setSendEmail] = useState(false);
  const [emails, setEmails] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankBranch, setBankBranch] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [pdf, setPdf] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getReceiptDialogData(paymentId).catch(actionCrashed);
      if (!alive) return;
      if (!res.ok) {
        setLoadError(res.message);
        return;
      }
      setData(res.data);
      setEmails(res.data.payment.customerEmail ?? "");
      setBankName(res.data.payment.bankName ?? "");
    })();
    return () => {
      alive = false;
    };
  }, [paymentId]);

  const isCheque = data?.payment.method === "check";
  const chequeFields = isCheque ? { bankName, bankBranch, bankAccount } : {};
  const emailList = emails.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  const canIssue = !!data && data.configured && !data.existing && !data.inProgress && !data.blocker;

  async function preview() {
    setShowPreview(true);
    setPdfLoading(true);
    setPdfError(null);
    const res = await previewReceiptForPayment(paymentId, chequeFields).catch(actionCrashed);
    setPdfLoading(false);
    if (!res.ok) {
      setPdf(null);
      setPdfError(res.message);
      return;
    }
    setPdf(res.pdfBase64);
  }

  async function issue(): Promise<boolean> {
    const res = await issueReceiptForPayment(paymentId, {
      sendEmail,
      emails: sendEmail ? emailList : undefined,
      ...chequeFields,
    }).catch(actionCrashed);
    if (!res.ok) {
      toastFailure(res);
      if ("code" in res && (res.code === "already_issued" || res.code === "ambiguous")) {
        onOpenChange(false);
        router.refresh();
      }
      return false;
    }
    toastIssued(res, res.document.url);
    onOpenChange(false);
    router.refresh();
    return true;
  }

  const p = data?.payment;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className={cn("max-h-[92vh] overflow-y-auto", showPreview ? "sm:max-w-3xl" : "sm:max-w-md")}>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            הפקת קבלה ב-Green Invoice
            {data ? <GiEnvBadge env={data.env} /> : null}
          </DialogTitle>
          <DialogDescription>{p ? `תשלום ${p.number} · ${p.customerName}` : "טוען פרטי תשלום…"}</DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : !data || !p ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            טוען…
          </div>
        ) : !data.configured ? (
          <GiNotConnectedLink className="py-4 text-sm" />
        ) : (
          <div className={cn("grid gap-4", showPreview && "md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]")}>
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border p-3 text-sm">
                <SummaryRow label="סכום" value={formatIlsDense(p.amount)} strong />
                <SummaryRow label="תאריך" value={formatDateShort(p.paidAt)} />
                <SummaryRow
                  label="אמצעי תשלום"
                  value={`${paymentMethodLabels[p.method]}${p.reference ? ` · ${p.reference}` : ""}`}
                />
                <SummaryRow
                  label="תעודות משלוח"
                  value={p.deliveryNumbers.length ? p.deliveryNumbers.join(", ") : "לא הוקצה (מקדמה)"}
                />
              </div>

              {data.existing ? (
                <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                  <span>
                    כבר הופקה {data.existing.typeLabel ?? "קבלה"}
                    {data.existing.number ? ` מס׳ ${data.existing.number}` : ""} — לא מפיקים פעמיים.
                  </span>
                  {data.existing.url ? <GiDocumentLinkButton url={data.existing.url} label="פתיחת PDF" /> : null}
                </div>
              ) : data.inProgress ? (
                <GiNotice>הפקת קבלה לתשלום זה כבר מתבצעת. רעננו את הדף בעוד רגע.</GiNotice>
              ) : data.blocker ? (
                <GiNotice>{data.blocker}</GiNotice>
              ) : (
                <>
                  {data.recovering ? (
                    <GiNotice>
                      ניסיון הפקה קודם לא הסתיים. בלחיצה על הפקה המערכת תבדוק קודם ב-Green Invoice אם המסמך כבר הופק — ולא תפיק אותו פעמיים.
                    </GiNotice>
                  ) : null}
                  {data.notInvoiced.length ? (
                    <GiNotice>
                      לתעודות {data.notInvoiced.join(", ")} עדיין לא הופקה חשבונית — הקבלה לא תקושר אליהן.
                    </GiNotice>
                  ) : data.linkedInvoices ? (
                    <p className="text-xs text-muted-foreground">
                      הקבלה תקושר ל-{data.linkedInvoices === 1 ? "חשבונית אחת" : `${data.linkedInvoices} חשבוניות`} ב-Green Invoice.
                    </p>
                  ) : null}

                  {isCheque ? (
                    <div className="grid grid-cols-3 gap-2">
                      <GiField label="בנק">
                        <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
                      </GiField>
                      <GiField label="סניף">
                        <Input value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} inputMode="numeric" />
                      </GiField>
                      <GiField label="חשבון">
                        <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} inputMode="numeric" />
                      </GiField>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(v === true)} />
                      שליחת הקבלה במייל ללקוח
                    </label>
                    {sendEmail ? (
                      <GiField label="כתובות מייל" hint="עד 3 כתובות, מופרדות בפסיק">
                        <Input dir="ltr" value={emails} onChange={(e) => setEmails(e.target.value)} />
                      </GiField>
                    ) : null}
                  </div>
                </>
              )}
            </div>
            {showPreview ? <GiPdfPreview base64={pdf} loading={pdfLoading} error={pdfError} className="h-[55vh]" /> : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            סגירה
          </Button>
          {canIssue ? (
            <>
              <Button type="button" variant="secondary" onClick={() => void preview()} disabled={pdfLoading}>
                <Eye aria-hidden />
                תצוגה מקדימה
              </Button>
              <Button type="button" onClick={() => setConfirmOpen(true)}>
                <ReceiptText aria-hidden />
                הפקת קבלה
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="להפיק קבלה?"
        description={`הקבלה על ${p ? formatIlsDense(p.amount) : ""} תקבל מספר רץ ב-Green Invoice ולא ניתן למחוק אותה.${
          sendEmail && emailList.length ? ` הקבלה תישלח אל: ${emailList.join(", ")}.` : ""
        }${data?.env === "sandbox" ? " (סביבת בדיקות)" : ""}`}
        confirmLabel="הפקת קבלה"
        pendingLabel="מפיק…"
        onConfirm={issue}
      />
    </Dialog>
  );
}
