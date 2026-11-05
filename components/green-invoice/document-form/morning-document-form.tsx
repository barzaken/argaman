"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calculator, Eye, FileCheck2, Info, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EntityPicker } from "@/components/documents/entity-picker";
import { FormPageShell, FormStickyFooter } from "@/components/form-sticky-footer";
import {
  GiEnvBadge,
  GiNotConnectedLink,
  GiNotice,
  GiPdfPreview,
  SummaryRow,
  toastFailure,
  toastIssued,
} from "@/components/green-invoice/shared";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { actionCrashed } from "@/lib/action-client";
import { formatDateShort } from "@/lib/db/format";
import { cn } from "@/lib/utils";
import type { GreenInvoiceEnv } from "@/lib/green-invoice/config";
import {
  GI_CURRENCIES,
  GI_DISCOUNT_TYPE_LABELS,
  GI_DOC_TYPE_DEFS,
  GI_DOC_TYPE_GROUPS,
  GI_DOC_VAT_TYPE_LABELS,
  GI_LANG_LABELS,
  canRoleIssue,
  type GiDiscountType,
  type GiDocType,
  type GiDocVatType,
  type GiLang,
  type GiLinkType,
} from "@/lib/green-invoice/document-types";
import {
  adaptModelToType,
  computeTotals,
  fillPaymentsToTotal,
  issuesByPath,
  validateDocumentModel,
  type DocFormModel,
  type DocIssue,
} from "@/lib/green-invoice/document-builder";
import {
  getMorningDocumentInfo,
  issueMorningDocument,
  previewMorningDocument,
  type MorningDocumentInfo,
  type MorningIssueContext,
} from "@/app/dashboard/green-invoice/documents/actions";
import type { IncomeSource, LinkedPick, MorningFormPrefill, PartyOption } from "@/app/dashboard/green-invoice/documents/prefill";

import { DecimalInput, Field, OptionSelect, SectionTitle, formatMoney, labelsToOptions } from "./form-bits";
import { IncomeRowsEditor } from "./income-rows-editor";
import { LinkedDocumentsPicker } from "./linked-documents-picker";
import { PaymentRowsEditor } from "./payment-rows-editor";

const LANG_OPTIONS = labelsToOptions(GI_LANG_LABELS);
const DOC_VAT_OPTIONS = labelsToOptions(GI_DOC_VAT_TYPE_LABELS);
const DISCOUNT_OPTIONS = labelsToOptions(GI_DISCOUNT_TYPE_LABELS);
const CURRENCY_OPTIONS = GI_CURRENCIES.map((c) => ({ value: c.code, label: `${c.label} (${c.code})` }));

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16)
      );
}

function CheckField({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-start gap-2 text-sm", disabled && "opacity-60")}>
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <span className="flex flex-col">
        <span className="font-medium text-foreground">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

export function MorningDocumentForm({
  prefill,
  customers,
  suppliers,
  role,
  configured,
  env,
  today,
}: {
  prefill: MorningFormPrefill;
  customers: PartyOption[];
  suppliers: PartyOption[];
  role: "admin" | "agent";
  configured: boolean;
  env: GreenInvoiceEnv;
  today: string;
}) {
  const router = useRouter();
  const [model, setModel] = useState<DocFormModel>(prefill.model);
  const [customerId, setCustomerId] = useState<string | null>(prefill.context.customerId);
  const [supplierId, setSupplierId] = useState<string | null>(prefill.context.supplierId);
  const [partyMode, setPartyMode] = useState<"crm" | "adhoc">(
    prefill.context.customerId || prefill.context.supplierId || !prefill.model.client.name ? "crm" : "adhoc"
  );
  const [linked, setLinked] = useState<LinkedPick[]>(prefill.linked);
  const [serverIssues, setServerIssues] = useState<DocIssue[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [info, setInfo] = useState<MorningDocumentInfo | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdf, setPdf] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);
  // מזהה בקשה להפקה — אותו מזהה בכל ניסיון עד הצלחה (נעילה נגד הפקה כפולה בשרת)
  const requestId = useRef<string | null>(null);

  const def = GI_DOC_TYPE_DEFS[model.type];
  const isSupplierDoc = def.counterparty === "supplier";
  const allowed = canRoleIssue(model.type, role);
  const vatRate = info?.vatRate ?? undefined;

  // מידע מ-Morning על הסוג (מספר הבא, מע״מ, תאריך אחרון, ערוצי תשלום)
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    getMorningDocumentInfo(model.type)
      .catch(actionCrashed)
      .then((res) => {
        if (cancelled) return;
        setInfo(res.ok && "info" in res ? res.info : null);
      });
    return () => {
      cancelled = true;
    };
  }, [model.type, configured]);

  const totals = useMemo(() => computeTotals(model, vatRate), [model, vatRate]);

  const context: MorningIssueContext = {
    ...prefill.context,
    customerId: !isSupplierDoc && partyMode === "crm" ? customerId : null,
    supplierId: isSupplierDoc && partyMode === "crm" ? supplierId : null,
  };

  const fullModel: DocFormModel = { ...model, linkedDocumentIds: linked.map((l) => l.greenInvoiceId) };

  function currentIssues(forPreview = false): DocIssue[] {
    const list = validateDocumentModel(fullModel, {
      today,
      vatRate,
      lastDocumentDate: info?.lastDocumentDate,
      role,
      forPreview,
    });
    if (partyMode === "crm" && !(isSupplierDoc ? supplierId : customerId)) {
      list.unshift({ path: "client.name", message: isSupplierDoc ? "יש לבחור ספק" : "יש לבחור לקוח מהרשימה (או לעבור ללקוח חדש)" });
    }
    return list;
  }

  // ולידציה חיה אחרי ניסיון ראשון; שגיאות מהשרת מוצגות כשאין שגיאות מקומיות
  const localIssues = showErrors ? currentIssues() : [];
  const issues = localIssues.length ? localIssues : showErrors ? serverIssues : [];
  const errors = issuesByPath(issues);

  function set<K extends keyof DocFormModel>(key: K, value: DocFormModel[K]) {
    setModel((m) => ({ ...m, [key]: value }));
  }
  function setClient(patch: Partial<DocFormModel["client"]>) {
    setModel((m) => ({ ...m, client: { ...m.client, ...patch } }));
  }

  function changeType(t: GiDocType) {
    setModel((m) => adaptModelToType(m, t, today));
    setPdf(null);
    const nextDef = GI_DOC_TYPE_DEFS[t];
    if (nextDef.counterparty !== def.counterparty) {
      setClient({ id: null, name: "", taxId: "", emails: [], address: "", phone: "" });
      setCustomerId(null);
      setSupplierId(null);
    }
  }

  function pickParty(id: string | null) {
    const list = isSupplierDoc ? suppliers : customers;
    if (isSupplierDoc) setSupplierId(id);
    else setCustomerId(id);
    const p = id ? list.find((x) => x.id === id) : null;
    setClient({
      id: null,
      name: p?.name ?? "",
      taxId: p?.tax_id ?? "",
      emails: p?.email ? [p.email] : [],
      address: p?.address ?? "",
      phone: p?.phone ?? "",
      add: false,
    });
  }

  function fillFrom(src: IncomeSource) {
    set("income", src.rows.map((r) => ({ ...r })));
    toast.success(`השורות מולאו מ${src.label}`);
  }

  async function openPreview() {
    setShowErrors(true);
    setServerIssues([]);
    const list = currentIssues(true);
    if (list.length) {
      toast.error(`יש ${list.length} שדות לתיקון: ${list[0].message}`);
      return;
    }
    setPreviewOpen(true);
    setPdf(null);
    setPdfError(null);
    setPdfLoading(true);
    const res = await previewMorningDocument(fullModel, context).catch(actionCrashed);
    setPdfLoading(false);
    if (!res.ok) {
      setPdfError(res.message);
      if ("issues" in res && res.issues) setServerIssues(res.issues);
      return;
    }
    setPdf(res.pdfBase64);
  }

  function askIssue() {
    setShowErrors(true);
    setServerIssues([]);
    const list = currentIssues();
    if (list.length) {
      toast.error(`יש ${list.length} שדות לתיקון: ${list[0].message}`);
      return;
    }
    setConfirmOpen(true);
  }

  async function issue(): Promise<boolean> {
    if (issuing) return false;
    setIssuing(true);
    try {
      if (requestId.current == null) requestId.current = newRequestId();
      const res = await issueMorningDocument({ requestId: requestId.current, model: fullModel, context }).catch(actionCrashed);
      if (!res.ok) {
        if ("issues" in res && res.issues) setServerIssues(res.issues);
        toastFailure(res);
        if ("code" in res && res.code === "already_issued" && res.documentId) {
          router.push(`/dashboard/documents/${res.documentId}`);
        }
        return false;
      }
      toastIssued(res, res.document.url);
      setPreviewOpen(false);
      requestId.current = null;
      router.push(res.document.documentId ? `/dashboard/documents/${res.document.documentId}` : "/dashboard/green-invoice/documents");
      return true;
    } finally {
      setIssuing(false);
    }
  }

  const showVatTypes = info?.vatTypes?.length ? DOC_VAT_OPTIONS.filter((o) => info.vatTypes!.includes(Number(o.value))) : DOC_VAT_OPTIONS;
  const infoMismatch: string[] = [];
  if (info) {
    if (info.paymentRowsEnabled === false && def.payment === "required") infoMismatch.push("Morning מדווח שסוג זה לא מקבל שורות תקבול בעסק שלכם");
    if (info.paymentRowsEnabled === true && def.payment === "forbidden") infoMismatch.push("Morning מדווח שסוג זה מקבל שורות תקבול — הטופס לא מציג אותן");
    if (info.incomeRowsRequired === true && def.income !== "required") infoMismatch.push("Morning מדווח ששורות הכנסה הן חובה בסוג זה בעסק שלכם");
  }
  const payable = def.payment !== "forbidden";
  const takesIncome = def.income !== "forbidden";
  const balanceOff = payable && (model.income.length > 0 || def.paymentsMustEqualTotal === "always") && Math.abs(totals.balance) > 0.009;

  return (
    <FormPageShell>
      <form
        className="flex min-h-0 flex-1 flex-col"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          askIssue();
        }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
            {/* ---- כותרת ---- */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground">
                  הפקת מסמך ב-Morning
                  {configured ? <GiEnvBadge env={env} /> : null}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {def.name} — {def.hint}
                </p>
                {prefill.sourceLabels.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {prefill.sourceLabels.map((l) => (
                      <Badge key={l} variant="outline">
                        מולא מ{l}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
              {!configured ? <GiNotConnectedLink /> : null}
            </div>

            {!allowed ? (
              <GiNotice>
                <span className="inline-flex items-center gap-1">
                  <Lock className="size-3.5" aria-hidden />
                  הפקת {def.name} מותרת למנהל בלבד. אפשר לצפות בתצוגה מקדימה.
                </span>
              </GiNotice>
            ) : null}
            {infoMismatch.map((m) => (
              <GiNotice key={m}>{m}</GiNotice>
            ))}

            {/* ---- סוג ופרטי מסמך ---- */}
            <section className="flex flex-col gap-4" aria-label="פרטי המסמך">
              <SectionTitle
                title="פרטי המסמך"
                subtitle={
                  info ? (
                    <span className="inline-flex flex-wrap items-center gap-x-3">
                      {info.number ? <span>המספר הבא: {info.number}</span> : null}
                      {info.vatRate != null ? <span>מע״מ: {Math.round(info.vatRate * 1000) / 10}%</span> : null}
                      {info.lastDocumentDate ? <span>מסמך אחרון מסוג זה: {formatDateShort(info.lastDocumentDate)}</span> : null}
                    </span>
                  ) : undefined
                }
              />
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="סוג מסמך" error={errors.type}>
                  <Select value={String(model.type)} onValueChange={(v) => changeType(Number(v) as GiDocType)}>
                    <SelectTrigger className="w-full" aria-label="סוג מסמך">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {GI_DOC_TYPE_GROUPS.map((g) => (
                        <SelectGroup key={g.label}>
                          <SelectLabel>{g.label}</SelectLabel>
                          {g.types.map((t) => (
                            <SelectItem key={t} value={String(t)}>
                              {GI_DOC_TYPE_DEFS[t].name} ({t})
                              {!canRoleIssue(t, role) ? " · מנהל בלבד" : ""}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="תאריך המסמך" error={errors.date} hint={def.futureDateAllowed ? undefined : "לא עתידי"}>
                  <Input
                    type="date"
                    dir="ltr"
                    className="text-start"
                    value={model.date ?? ""}
                    max={def.futureDateAllowed ? undefined : today}
                    onChange={(e) => set("date", e.target.value)}
                    aria-invalid={!!errors.date || undefined}
                  />
                </Field>
                {def.fields.dueDate !== "forbidden" ? (
                  <Field label={model.type === 10 ? "בתוקף עד / תאריך לתשלום" : "תאריך לתשלום"} error={errors.dueDate}>
                    <Input
                      type="date"
                      dir="ltr"
                      className="text-start"
                      value={model.dueDate ?? ""}
                      onChange={(e) => set("dueDate", e.target.value)}
                      aria-invalid={!!errors.dueDate || undefined}
                    />
                  </Field>
                ) : null}
                <Field label="שפת המסמך" error={errors.lang}>
                  <OptionSelect value={model.lang} onChange={(v) => set("lang", v as GiLang)} options={LANG_OPTIONS} ariaLabel="שפת המסמך" />
                </Field>
                <Field label="מטבע" error={errors.currency}>
                  <OptionSelect value={model.currency} onChange={(v) => set("currency", v)} options={CURRENCY_OPTIONS} ariaLabel="מטבע" />
                </Field>
                {model.currency !== "ILS" ? (
                  <Field label="שער המרה לשקל" error={errors.currencyRate} hint="ריק = השער של Morning">
                    <DecimalInput value={model.currencyRate} onChange={(v) => set("currencyRate", v)} invalid={!!errors.currencyRate} />
                  </Field>
                ) : null}
                <Field label="סוג מע״מ למסמך" error={errors.vatType}>
                  <OptionSelect
                    value={String(model.vatType)}
                    onChange={(v) => set("vatType", Number(v) as GiDocVatType)}
                    options={showVatTypes}
                    ariaLabel="סוג מע״מ למסמך"
                  />
                </Field>
              </div>
            </section>

            {/* ---- לקוח / ספק ---- */}
            <section className="flex flex-col gap-4" aria-label={isSupplierDoc ? "ספק" : "לקוח"}>
              <SectionTitle
                title={isSupplierDoc ? "ספק" : "לקוח"}
                subtitle={
                  isSupplierDoc
                    ? "הזמנת רכש נשלחת לספק — פרטי הספק נכנסים בשדה הלקוח של המסמך"
                    : "לקוח מהמערכת (נמצא או נוצר אוטומטית ב-Morning) או לקוח חד-פעמי"
                }
                actions={
                  <Tabs value={partyMode} onValueChange={(v) => setPartyMode(v as "crm" | "adhoc")} dir="rtl">
                    <TabsList aria-label="סוג הלקוח">
                      <TabsTrigger value="crm">{isSupplierDoc ? "ספק מהמערכת" : "לקוח מהמערכת"}</TabsTrigger>
                      <TabsTrigger value="adhoc">{isSupplierDoc ? "ספק אחר" : "לקוח חדש / חד-פעמי"}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                }
              />
              {partyMode === "crm" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <EntityPicker
                      label={isSupplierDoc ? "ספק" : "לקוח"}
                      name={isSupplierDoc ? "supplier_id" : "customer_id"}
                      options={isSupplierDoc ? suppliers : customers}
                      value={isSupplierDoc ? supplierId : customerId}
                      onChange={pickParty}
                      placeholder="הקלידו שם או ח.פ"
                    />
                    {errors["client.name"] ? (
                      <span className="text-xs text-destructive" role="alert">
                        {errors["client.name"]}
                      </span>
                    ) : null}
                  </div>
                  <Field
                    label="מיילים לשליחת המסמך"
                    hint="עד 3 כתובות, מופרדות בפסיק. ריק = בלי מייל"
                    error={errors["client.emails"]}
                  >
                    <Input
                      dir="ltr"
                      className="text-start"
                      value={(model.client.emails ?? []).join(", ")}
                      onChange={(e) => setClient({ emails: e.target.value.split(/[,;]\s*/) })}
                    />
                  </Field>
                  {(isSupplierDoc ? supplierId : customerId) ? (
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm md:col-span-2">
                      <p className="font-medium">{model.client.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[model.client.taxId ? `ח.פ ${model.client.taxId}` : null, model.client.address, model.client.phone]
                          .filter(Boolean)
                          .join(" · ") || "אין פרטים נוספים"}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label={isSupplierDoc ? "שם הספק" : "שם הלקוח"} error={errors["client.name"]}>
                    <Input value={model.client.name} onChange={(e) => setClient({ name: e.target.value })} aria-invalid={!!errors["client.name"] || undefined} />
                  </Field>
                  <Field label="ח.פ / ת״ז">
                    <Input dir="ltr" className="text-start" value={model.client.taxId ?? ""} onChange={(e) => setClient({ taxId: e.target.value })} />
                  </Field>
                  <Field label="מיילים לשליחת המסמך" hint="עד 3, מופרדות בפסיק" error={errors["client.emails"]}>
                    <Input
                      dir="ltr"
                      className="text-start"
                      value={(model.client.emails ?? []).join(", ")}
                      onChange={(e) => setClient({ emails: e.target.value.split(/[,;]\s*/) })}
                    />
                  </Field>
                  <Field label="טלפון">
                    <Input dir="ltr" className="text-start" value={model.client.phone ?? ""} onChange={(e) => setClient({ phone: e.target.value })} />
                  </Field>
                  <Field label="נייד">
                    <Input dir="ltr" className="text-start" value={model.client.mobile ?? ""} onChange={(e) => setClient({ mobile: e.target.value })} />
                  </Field>
                  <Field label="פקס">
                    <Input dir="ltr" className="text-start" value={model.client.fax ?? ""} onChange={(e) => setClient({ fax: e.target.value })} />
                  </Field>
                  <Field label="כתובת">
                    <Input value={model.client.address ?? ""} onChange={(e) => setClient({ address: e.target.value })} />
                  </Field>
                  <Field label="עיר">
                    <Input value={model.client.city ?? ""} onChange={(e) => setClient({ city: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="מיקוד">
                      <Input dir="ltr" className="text-start" value={model.client.zip ?? ""} onChange={(e) => setClient({ zip: e.target.value })} />
                    </Field>
                    <Field label="מדינה" error={errors["client.country"]} hint="קוד בן 2 אותיות">
                      <Input
                        dir="ltr"
                        className="text-start uppercase"
                        maxLength={2}
                        value={model.client.country ?? "IL"}
                        onChange={(e) => setClient({ country: e.target.value.toUpperCase() })}
                      />
                    </Field>
                  </div>
                  {!isSupplierDoc ? (
                    <div className="md:col-span-3">
                      <CheckField
                        label="הוספה לרשימת הלקוחות ב-Morning"
                        checked={!!model.client.add}
                        onChange={(v) => setClient({ add: v })}
                        hint="בלי סימון — הלקוח מופיע רק במסמך הזה"
                      />
                    </div>
                  ) : null}
                </div>
              )}
              {def.fields.clientSelf !== "forbidden" ? (
                <CheckField
                  label="חשבונית עצמית"
                  checked={!!model.client.self}
                  onChange={(v) => setClient({ self: v })}
                  hint="רק בחשבונית מס (305), כשהעסק מפיק חשבונית בשם הספק"
                />
              ) : null}
            </section>

            {/* ---- שורות הכנסה ---- */}
            {takesIncome ? (
              <section className="flex flex-col gap-4" aria-label="שורות הכנסה">
                <SectionTitle
                  title={def.income === "required" ? "שורות הכנסה" : "שורות הכנסה (רשות)"}
                  subtitle={
                    def.income === "optional"
                      ? "בקבלה אפשר להשאיר בלי שורות; אם מוסיפים — הסכום חייב להיות שווה לתקבולים"
                      : "מחירים לפי בחירת המע״מ בכל שורה; מחיר שלילי = שורת הנחה"
                  }
                  actions={
                    prefill.incomeSources.length ? (
                      <div className="flex flex-wrap gap-2">
                        {prefill.incomeSources.map((s) => (
                          <Button key={`${s.kind}-${s.id}`} type="button" variant="outline" size="sm" onClick={() => fillFrom(s)}>
                            מילוי מ{s.label}
                          </Button>
                        ))}
                      </div>
                    ) : undefined
                  }
                />
                {errors.income ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.income}
                  </p>
                ) : null}
                <IncomeRowsEditor
                  rows={model.income}
                  onChange={(rows) => set("income", rows)}
                  currency={model.currency}
                  docExempt={model.vatType === 1}
                  errors={errors}
                />
                {def.fields.discount !== "forbidden" ? (
                  <div className="grid gap-4 md:grid-cols-4">
                    <Field label="הנחה על המסמך" hint="לפני מע״מ" error={errors["discount.amount"]}>
                      <DecimalInput
                        value={model.discount?.amount ?? ""}
                        onChange={(v) => set("discount", { amount: v, type: model.discount?.type ?? "sum" })}
                        invalid={!!errors["discount.amount"]}
                      />
                    </Field>
                    <Field label="סוג ההנחה">
                      <OptionSelect
                        value={model.discount?.type ?? "sum"}
                        onChange={(v) => set("discount", { amount: model.discount?.amount ?? "", type: v as GiDiscountType })}
                        options={DISCOUNT_OPTIONS}
                        ariaLabel="סוג ההנחה"
                      />
                    </Field>
                    <div className="flex items-end pb-1 md:col-span-2">
                      <CheckField label="עיגול סכומים" checked={!!model.rounding} onChange={(v) => set("rounding", v)} hint="הסה״כ מעוגל לשקל שלם" />
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* ---- תקבולים ---- */}
            {payable ? (
              <section className="flex flex-col gap-4" aria-label="תקבולים">
                <SectionTitle
                  title={def.payment === "required" ? "תקבולים" : "תקבולים (רשות)"}
                  subtitle="אמצעי התשלום שהתקבלו — כל אמצעי עם השדות שלו"
                  actions={
                    takesIncome && model.income.length > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => set("payment", fillPaymentsToTotal(model, { today, vatRate }))}
                        disabled={!(totals.total > 0)}
                      >
                        <Calculator className="size-3.5" aria-hidden />
                        מלא לפי הסה״כ
                      </Button>
                    ) : undefined
                  }
                />
                {errors.payment ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.payment}
                  </p>
                ) : null}
                <PaymentRowsEditor rows={model.payment} onChange={(rows) => set("payment", rows)} today={today} errors={errors} />
              </section>
            ) : null}

            {/* ---- סיכום ---- */}
            <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-sm shadow-sm" aria-label="סיכום סכומים">
              <h3 className="text-sm font-semibold">סיכום</h3>
              {takesIncome && model.income.length ? (
                <>
                  {totals.discount ? (
                    <>
                      <SummaryRow label="סכום השורות לפני מע״מ" value={formatMoney(totals.linesBeforeVat, model.currency)} />
                      <SummaryRow label="הנחה" value={`-${formatMoney(totals.discount, model.currency)}`} />
                    </>
                  ) : null}
                  {totals.exempt ? <SummaryRow label="מתוכו פטור ממע״מ" value={formatMoney(totals.exempt, model.currency)} /> : null}
                  <SummaryRow label="לפני מע״מ" value={formatMoney(totals.beforeVat, model.currency)} />
                  <SummaryRow label={`מע״מ${vatRate != null ? ` (${Math.round(vatRate * 1000) / 10}%)` : ""}`} value={formatMoney(totals.vat, model.currency)} />
                  {totals.rounding ? <SummaryRow label="עיגול" value={formatMoney(totals.rounding, model.currency)} /> : null}
                  <SummaryRow label="סה״כ לתשלום" value={formatMoney(totals.total, model.currency)} strong />
                </>
              ) : null}
              {payable ? <SummaryRow label="סה״כ תקבולים" value={formatMoney(totals.payments, model.currency)} strong={!model.income.length} /> : null}
              {balanceOff ? (
                <p className="text-xs text-amber-700 dark:text-amber-400" role="status">
                  הפרש בין התקבולים לסכום המסמך: {formatMoney(totals.balance, model.currency)}
                </p>
              ) : null}
              {errors.total ? (
                <p className="text-xs text-destructive" role="alert">
                  {errors.total}
                </p>
              ) : null}
            </section>

            {/* ---- מסמכים מקושרים ---- */}
            <section className="flex flex-col gap-4" aria-label="מסמכים מקושרים">
              <SectionTitle title="מסמכים מקושרים" subtitle="קבלה ← חשבונית, חשבונית ← הזמנה / הצעה / תעודת משלוח, זיכוי ← חשבונית" />
              <LinkedDocumentsPicker
                type={model.type}
                linked={linked}
                onLinkedChange={(l) => {
                  setLinked(l);
                  if (!l.length) set("linkType", "");
                }}
                linkType={(model.linkType || "") as GiLinkType | ""}
                onLinkTypeChange={(t) => set("linkType", t)}
                customerId={customerId}
                configured={configured}
                errors={errors}
              />
            </section>

            {/* ---- טקסטים ואפשרויות ---- */}
            <section className="flex flex-col gap-4" aria-label="טקסטים ושליחה">
              <SectionTitle title="טקסטים ושליחה" />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="תיאור המסמך" hint="כותרת שמופיעה במסמך">
                  <Input value={model.description ?? ""} onChange={(e) => set("description", e.target.value)} />
                </Field>
                <Field label="הערות במסמך">
                  <Textarea rows={2} value={model.remarks ?? ""} onChange={(e) => set("remarks", e.target.value)} />
                </Field>
                <Field label="טקסט תחתון" error={errors.footer}>
                  <Textarea rows={2} value={model.footer ?? ""} onChange={(e) => set("footer", e.target.value)} />
                </Field>
                <Field label="תוכן נוסף למייל" hint="נשלח רק כשיש כתובות מייל">
                  <Textarea rows={2} value={model.emailContent ?? ""} onChange={(e) => set("emailContent", e.target.value)} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-6">
                <CheckField label="חתימה דיגיטלית" checked={model.signed !== false} onChange={(v) => set("signed", v)} />
                <CheckField
                  label="צירוף PDF למייל"
                  checked={!!model.attachment}
                  onChange={(v) => set("attachment", v)}
                  hint="רק כשיש כתובות מייל"
                />
              </div>
              {errors.signed ? (
                <p className="text-xs text-destructive" role="alert">
                  {errors.signed}
                </p>
              ) : null}
              {def.fields.linkedPaymentId !== "forbidden" ? (
                <Field label="מזהה תשלום מקושר ב-Morning" hint="רשות — רק בחשבונית מס" className="max-w-md" error={errors.linkedPaymentId}>
                  <Input dir="ltr" className="text-start" value={model.linkedPaymentId ?? ""} onChange={(e) => set("linkedPaymentId", e.target.value)} />
                </Field>
              ) : null}
              {def.fields.paymentRequestData !== "forbidden" ? (
                <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                  <CheckField
                    label="בקשת תשלום מקוון במסמך"
                    checked={!!model.paymentRequest?.enabled}
                    onChange={(v) => set("paymentRequest", { enabled: v, plugins: model.paymentRequest?.plugins ?? [], maxPayments: model.paymentRequest?.maxPayments ?? "" })}
                    hint="כפתור תשלום (אשראי / ביט / PayPal) לפי ערוצי התשלום המחוברים ב-Morning"
                    disabled={!info?.paymentPlugins.length && !model.paymentRequest?.enabled}
                  />
                  {!info?.paymentPlugins.length ? (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Info className="size-3.5" aria-hidden />
                      אין ערוצי תשלום מקוון פעילים בחשבון Morning
                    </p>
                  ) : null}
                  {model.paymentRequest?.enabled ? (
                    <div className="flex flex-col gap-2">
                      {info?.paymentPlugins.map((p) => {
                        const on = model.paymentRequest!.plugins.some((x) => x.id === p.id);
                        return (
                          <CheckField
                            key={p.id}
                            label={p.name}
                            checked={on}
                            onChange={(v) =>
                              set("paymentRequest", {
                                ...model.paymentRequest!,
                                plugins: v
                                  ? [...model.paymentRequest!.plugins, { id: p.id, ...(p.type ? { type: p.type } : {}) }]
                                  : model.paymentRequest!.plugins.filter((x) => x.id !== p.id),
                              })
                            }
                          />
                        );
                      })}
                      <Field label="מספר תשלומים מרבי (אשראי)" className="max-w-xs" error={errors["paymentRequest.maxPayments"]}>
                        <DecimalInput
                          value={model.paymentRequest.maxPayments ?? ""}
                          onChange={(v) => set("paymentRequest", { ...model.paymentRequest!, maxPayments: v })}
                        />
                      </Field>
                      {errors.paymentRequest ? (
                        <p className="text-xs text-destructive" role="alert">
                          {errors.paymentRequest}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            {showErrors && issues.length ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert" aria-label="שגיאות בטופס">
                <p className="font-medium text-destructive">יש לתקן לפני ההפקה:</p>
                <ul className="mt-1 list-disc ps-5 text-destructive">
                  {issues.slice(0, 12).map((i, k) => (
                    <li key={`${i.path}-${k}`}>{i.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        <FormStickyFooter>
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/green-invoice/documents">ביטול</Link>
          </Button>
          <div className="ms-auto flex flex-wrap items-center gap-3">
            <span className="text-sm tabular-nums text-muted-foreground">
              סה״כ: <span className="font-semibold text-foreground">{formatMoney(totals.documentAmount, model.currency)}</span>
            </span>
            <Button type="button" variant="outline" className="gap-1.5" onClick={() => void openPreview()} disabled={!configured}>
              <Eye className="size-4" aria-hidden />
              תצוגה מקדימה
            </Button>
            <Button type="submit" className="gap-1.5" disabled={!configured || !allowed || issuing}>
              {issuing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileCheck2 className="size-4" aria-hidden />}
              הפקת {def.name}
            </Button>
          </div>
        </FormStickyFooter>
      </form>

      <Dialog open={previewOpen} onOpenChange={(o) => !issuing && setPreviewOpen(o)}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              תצוגה מקדימה — {def.name}
              {configured ? <GiEnvBadge env={env} /> : null}
            </DialogTitle>
            <DialogDescription>
              התצוגה לא צורכת מספר מסמך. סה״כ {formatMoney(totals.documentAmount, model.currency)}
              {model.client.name ? ` · ${model.client.name}` : ""}
            </DialogDescription>
          </DialogHeader>
          <GiPdfPreview base64={pdf} loading={pdfLoading} error={pdfError} className="h-[62vh]" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)} disabled={issuing}>
              חזרה לעריכה
            </Button>
            <Button type="button" className="gap-1.5" onClick={askIssue} disabled={!pdf || !allowed || issuing}>
              <FileCheck2 className="size-4" aria-hidden />
              הפקת {def.name}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`להפיק ${def.name} ב-Morning?`}
        description={`${def.name} על סך ${formatMoney(totals.documentAmount, model.currency)}${model.client.name ? ` ל${model.client.name}` : ""}. מסמך שהופק אינו ניתן לעריכה או למחיקה${def.taxDocument ? " (תיקון — בחשבונית זיכוי)" : ""}.${
          model.attachment && (model.client.emails ?? []).filter((x) => x.trim()).length ? " המסמך יישלח במייל." : ""
        }`}
        confirmLabel={`הפקת ${def.name}`}
        pendingLabel="מפיק…"
        onConfirm={issue}
      />
    </FormPageShell>
  );
}
