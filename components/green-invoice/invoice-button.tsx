"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { actionCrashed } from "@/lib/action-client";
import { formatIlsDense } from "@/lib/db/format";
import { cn } from "@/lib/utils";
import {
  getInvoiceDialogData,
  issueInvoiceForDelivery,
  previewInvoiceForDelivery,
  type ChequeDetailsInput,
  type InvoiceDialogData,
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
import { GreenInvoiceCreditNoteButton } from "@/components/green-invoice/credit-note-button";

/**
 * כפתור "הפקת חשבונית" ב-Green Invoice לתעודת משלוח.
 *
 * זרימה: דיאלוג → בחירת סוג (305 חשבונית מס; 320 חשבונית מס/קבלה רק כשהתעודה שולמה במלואה)
 * → מייל ללקוח (אופציונלי) → תצוגה מקדימה (לא צורכת מספר) → אישור → הפקה → טוסט עם קישור ל-PDF.
 *
 * @param deliveryId  deliveries.id / deliveries_view.id
 * @param hasInvoice  !!deliveries_view.green_invoice_id — כשיש חשבונית מוצג קישור במקום הכפתור
 * @param greenInvoiceUrl  documents.green_invoice_url (אופציונלי; בלעדיו הקישור נטען בלחיצה)
 * @param customerEmail  deliveries_view.customer_email — ברירת המחדל למשלוח במייל
 * @param configured  אופציונלי: isGreenInvoiceConfigured() מצד השרת. false → קישור "לא מחובר".
 * @param isAdmin  אופציונלי: getCurrentCrmUser()?.isAdmin — מציג "זיכוי" ליד חשבונית קיימת (מנהל בלבד)
 */
export function GreenInvoiceInvoiceButton({
  deliveryId,
  hasInvoice = false,
  greenInvoiceUrl = null,
  customerEmail = null,
  configured,
  isAdmin = false,
  size = "sm",
  className,
}: {
  deliveryId: string;
  hasInvoice?: boolean;
  greenInvoiceUrl?: string | null;
  customerEmail?: string | null;
  configured?: boolean;
  isAdmin?: boolean;
  size?: "xs" | "sm" | "default";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (configured === false && !hasInvoice) return <GiNotConnectedLink className={className} />;

  if (hasInvoice) {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
        {greenInvoiceUrl ? (
          <GiDocumentLinkButton url={greenInvoiceUrl} label="חשבונית" size={size} />
        ) : (
          <Button type="button" variant="outline" size={size} onClick={() => setOpen(true)}>
            <FileCheck2 aria-hidden />
            חשבונית הופקה
          </Button>
        )}
        {isAdmin && configured !== false ? <GreenInvoiceCreditNoteButton deliveryId={deliveryId} size={size} /> : null}
        {open ? (
          <InvoiceDialog deliveryId={deliveryId} customerEmail={customerEmail} open={open} onOpenChange={setOpen} />
        ) : null}
      </span>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" size={size} className={className} onClick={() => setOpen(true)}>
        <ReceiptText aria-hidden />
        הפקת חשבונית
      </Button>
      {open ? (
        <InvoiceDialog deliveryId={deliveryId} customerEmail={customerEmail} open={open} onOpenChange={setOpen} />
      ) : null}
    </>
  );
}

function InvoiceDialog({
  deliveryId,
  customerEmail,
  open,
  onOpenChange,
}: {
  deliveryId: string;
  customerEmail: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<InvoiceDialogData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [type, setType] = useState<305 | 320>(305);
  const [sendEmail, setSendEmail] = useState(false);
  const [emails, setEmails] = useState(customerEmail ?? "");
  const [remarks, setRemarks] = useState("");
  const [cheques, setCheques] = useState<ChequeDetailsInput>({});
  const [pdf, setPdf] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const previewSeq = useRef(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getInvoiceDialogData(deliveryId).catch(actionCrashed);
      if (!alive) return;
      if (!res.ok) {
        setLoadError(res.message);
        return;
      }
      setData(res.data);
      setNotConfigured(!res.data.configured);
      if (!res.data.invoiceReceiptBlocker) setType(320);
      if (res.data.delivery.customerEmail && !customerEmail) setEmails(res.data.delivery.customerEmail);
      const init: ChequeDetailsInput = {};
      for (const c of res.data.cheques) init[c.paymentId] = { bankName: c.bankName ?? "", bankBranch: "", bankAccount: "" };
      setCheques(init);
    })();
    return () => {
      alive = false;
    };
  }, [deliveryId, customerEmail]);

  const loadPreview = useCallback(async () => {
    const seq = ++previewSeq.current;
    setPdfLoading(true);
    setPdfError(null);
    const res = await previewInvoiceForDelivery(deliveryId, type, {
      cheques: type === 320 ? cheques : undefined,
      remarks: remarks.trim() || undefined,
    }).catch(actionCrashed);
    if (seq !== previewSeq.current) return;
    setPdfLoading(false);
    if (!res.ok) {
      setPdf(null);
      setPdfError(res.message);
      if ("code" in res && res.code === "not_configured") setNotConfigured(true);
      return;
    }
    setPdf(res.pdfBase64);
  }, [deliveryId, type, cheques, remarks]);

  // תצוגה מקדימה ראשונה + בכל החלפת סוג מסמך
  const canIssue = !!data && data.configured && !data.existing && !data.inProgress && !data.delivery.cancelled;
  const autoKey = canIssue ? `${type}` : null;
  const lastAuto = useRef<string | null>(null);
  useEffect(() => {
    if (!autoKey || lastAuto.current === autoKey) return;
    lastAuto.current = autoKey;
    void loadPreview();
  }, [autoKey, loadPreview]);

  const emailList = emails
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  async function issue(): Promise<boolean> {
    const res = await issueInvoiceForDelivery(deliveryId, {
      type,
      sendEmail,
      emails: sendEmail ? emailList : undefined,
      remarks: remarks.trim() || null,
      cheques: type === 320 ? cheques : undefined,
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

  const typeLabel = type === 320 ? "חשבונית מס/קבלה" : "חשבונית מס";
  const d = data?.delivery;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            הפקת חשבונית ב-Green Invoice
            {data ? <GiEnvBadge env={data.env} /> : null}
          </DialogTitle>
          <DialogDescription>
            {d ? `תעודת משלוח ${d.number} · הזמנה ${d.orderNumber} · ${d.customerName}` : "טוען פרטי תעודה…"}
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : !data ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            טוען…
          </div>
        ) : notConfigured ? (
          <div className="py-6">
            <GiNotConnectedLink className="text-sm" />
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border p-3 text-sm">
                <SummaryRow label="לפני מע״מ" value={formatIlsDense(d!.subtotal)} />
                <SummaryRow label="מע״מ" value={formatIlsDense(d!.vatAmount)} />
                <SummaryRow label="סה״כ" value={formatIlsDense(d!.total)} strong />
                {d!.balance > 0 ? <SummaryRow label="יתרה לתשלום" value={formatIlsDense(d!.balance)} /> : null}
              </div>

              {data.existing ? (
                <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                  <span>
                    כבר הופקה {data.existing.typeLabel ?? "חשבונית"}
                    {data.existing.number ? ` מס׳ ${data.existing.number}` : ""} — לא מפיקים פעמיים.
                  </span>
                  {data.existing.url ? <GiDocumentLinkButton url={data.existing.url} label="פתיחת PDF" /> : null}
                </div>
              ) : data.inProgress ? (
                <GiNotice>הפקת מסמך לתעודה זו כבר מתבצעת. רעננו את הדף בעוד רגע.</GiNotice>
              ) : d!.cancelled ? (
                <GiNotice>התעודה מבוטלת — אין להפיק לה חשבונית.</GiNotice>
              ) : (
                <>
                  {data.recovering ? (
                    <GiNotice>
                      ניסיון הפקה קודם לא הסתיים. בלחיצה על הפקה המערכת תבדוק קודם ב-Green Invoice אם המסמך כבר הופק — ולא תפיק אותו פעמיים.
                    </GiNotice>
                  ) : null}
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1.5 text-sm font-medium">סוג המסמך</legend>
                    <TypeOption
                      selected={type === 305}
                      onSelect={() => setType(305)}
                      title="חשבונית מס (305)"
                      subtitle="לתעודה שטרם שולמה או ששולמה חלקית"
                    />
                    <TypeOption
                      selected={type === 320}
                      disabled={!!data.invoiceReceiptBlocker}
                      onSelect={() => setType(320)}
                      title="חשבונית מס/קבלה (320)"
                      subtitle={data.invoiceReceiptBlocker ?? "התעודה שולמה — החשבונית כוללת גם את פרטי התשלום"}
                    />
                  </fieldset>

                  {type === 320 && data.cheques.length ? (
                    <div className="flex flex-col gap-3 rounded-lg border p-3">
                      <span className="text-sm font-medium">פרטי צ׳קים</span>
                      {data.cheques.map((c) => (
                        <div key={c.paymentId} className="flex flex-col gap-2">
                          <span className="text-xs text-muted-foreground">
                            {c.label} · צ׳ק {c.reference ?? "—"} · {formatIlsDense(c.amount)}
                          </span>
                          <div className="grid grid-cols-3 gap-2">
                            {(["bankName", "bankBranch", "bankAccount"] as const).map((k) => (
                              <GiField key={k} label={k === "bankName" ? "בנק" : k === "bankBranch" ? "סניף" : "חשבון"}>
                                <Input
                                  value={cheques[c.paymentId]?.[k] ?? ""}
                                  onChange={(e) =>
                                    setCheques((prev) => ({
                                      ...prev,
                                      [c.paymentId]: { ...prev[c.paymentId], [k]: e.target.value },
                                    }))
                                  }
                                  inputMode={k === "bankName" ? "text" : "numeric"}
                                />
                              </GiField>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(v === true)} />
                      שליחת המסמך במייל ללקוח
                    </label>
                    {sendEmail ? (
                      <GiField label="כתובות מייל" hint="עד 3 כתובות, מופרדות בפסיק">
                        <Input dir="ltr" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="name@example.com" />
                      </GiField>
                    ) : null}
                  </div>

                  <GiField label="הערות במסמך (אופציונלי)">
                    <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} maxLength={500} />
                  </GiField>
                </>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">תצוגה מקדימה</span>
                {canIssue ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => void loadPreview()} disabled={pdfLoading}>
                    <Eye aria-hidden />
                    רענון תצוגה
                  </Button>
                ) : null}
              </div>
              <GiPdfPreview base64={pdf} loading={pdfLoading} error={pdfError} className="h-[58vh]" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            סגירה
          </Button>
          {canIssue && !notConfigured ? (
            <Button
              type="button"
              disabled={type === 320 && !!data?.invoiceReceiptBlocker}
              onClick={() => setConfirmOpen(true)}
            >
              <ReceiptText aria-hidden />
              הפקת {typeLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`להפיק ${typeLabel}?`}
        description={`המסמך יקבל מספר רץ ב-Green Invoice ולא ניתן למחוק אותו — תיקון רק בחשבונית זיכוי.${
          sendEmail && emailList.length ? ` המסמך יישלח אל: ${emailList.join(", ")}.` : ""
        }${data?.env === "sandbox" ? " (סביבת בדיקות)" : ""}`}
        confirmLabel={`הפקת ${typeLabel}`}
        pendingLabel="מפיק…"
        onConfirm={issue}
      />
    </Dialog>
  );
}


function TypeOption({
  selected,
  disabled,
  onSelect,
  title,
  subtitle,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"
      )}
    >
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{subtitle}</span>
    </button>
  );
}
