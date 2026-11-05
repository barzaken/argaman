"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Calculator, FileText, Link2, X } from "lucide-react";

import {
  checkDuplicateDocument,
  createDocument,
  updateDocument,
  type DuplicateDocument,
} from "@/app/dashboard/documents/actions";
import { FormPageShell, FormStickyFooter } from "@/components/form-sticky-footer";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { actionCrashed } from "@/lib/action-client";
import { normalizeDecimalInput, roundMoney } from "@/lib/db/calculations";
import { toHebrewError } from "@/lib/db/errors";
import { formatDateShort } from "@/lib/db/format";
import {
  customerDocumentKinds,
  documentKindGroups,
  documentKindLabels,
  documentSourceLabels,
  documentStatusLabels,
  supplierDocumentKinds,
} from "@/lib/db/labels";
import type { DocumentKindDb } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { EntityPicker, type EntityOption } from "./entity-picker";
import {
  DOCUMENT_ACCEPT_ATTR,
  buildDocumentStoragePath,
  formatFileSize,
  isBrowserRenderableImage,
  resolveMimeType,
  validateDocumentFile,
} from "./upload-utils";

const VAT_RATE = 0.18;

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // <label> עוטף את השדה — שם נגיש לקורא מסך ולחיצה על הכותרת מפעילה את השדה
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-border pb-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {subtitle ? <p className="text-muted-foreground text-xs">{subtitle}</p> : null}
    </div>
  );
}

export type DocumentFormValues = {
  kind: DocumentKindDb | "";
  document_number: string;
  document_date: string;
  due_date: string;
  counterparty_name: string;
  counterparty_tax_id: string;
  amount_before_vat: string;
  vat_amount: string;
  amount_total: string;
  currency: string;
  notes: string;
  customer_id: string | null;
  supplier_id: string | null;
  order_id: string | null;
  delivery_id: string | null;
  payment_id: string | null;
  expense_id: string | null;
  source: "upload" | "whatsapp";
};

export type LinkedRef = { id: string; label: string; href: string };

type Props = {
  mode: "create" | "edit";
  documentId?: string;
  initial: DocumentFormValues;
  customers: EntityOption[];
  suppliers: EntityOption[];
  /** קישורים קיימים להזמנה / משלוח / תשלום / הוצאה (מוצגים לקריאה + הסרה) */
  linked: Partial<Record<"order" | "delivery" | "payment" | "expense", LinkedRef>>;
  existingFile?: { file_name: string | null; mime_type: string | null; file_size: number | null } | null;
  /** סטטוס נוכחי (בעריכה) — מסמך שנדחה לא נבדק לכפילות */
  currentStatus?: "pending_review" | "processed" | "rejected";
  cancelHref: string;
};

const digitsOnly = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

const CURRENCY_OPTIONS = [
  { value: "ILS", label: "₪ שקל (ILS)" },
  { value: "USD", label: "$ דולר (USD)" },
  { value: "EUR", label: "€ אירו (EUR)" },
];

export function DocumentForm({
  mode,
  documentId,
  initial,
  customers,
  suppliers,
  linked: initialLinked,
  existingFile,
  currentStatus,
  cancelHref,
}: Props) {
  const router = useRouter();
  const [v, setV] = useState<DocumentFormValues>(initial);
  const [linked, setLinked] = useState(initialLinked);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateDocument | null>(null);
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  /** ישויות שנבחרו אוטומטית לפי ח.פ (כדי לא לדרוס בחירה ידנית) */
  const autoPicked = useRef<{ customer: boolean; supplier: boolean }>({
    customer: false,
    supplier: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    []
  );

  function set<K extends keyof DocumentFormValues>(key: K, value: DocumentFormValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
  }

  const kind = v.kind || null;
  const showCustomer = !kind || !supplierDocumentKinds.includes(kind) || !!v.customer_id;
  const showSupplier = !kind || !customerDocumentKinds.includes(kind) || !!v.supplier_id;

  // התאמה לפי ח.פ: לקוח / ספק קיים
  const taxDigits = digitsOnly(v.counterparty_tax_id);
  const matchCustomer = useMemo(
    () =>
      taxDigits.length >= 5
        ? customers.find((c) => digitsOnly(c.tax_id) === taxDigits) ?? null
        : null,
    [customers, taxDigits]
  );
  const matchSupplier = useMemo(
    () =>
      taxDigits.length >= 5
        ? suppliers.find((s) => digitsOnly(s.tax_id) === taxDigits) ?? null
        : null,
    [suppliers, taxDigits]
  );

  function onTaxIdChange(raw: string) {
    const digits = digitsOnly(raw);
    const c = digits.length >= 5 ? customers.find((x) => digitsOnly(x.tax_id) === digits) : undefined;
    const s = digits.length >= 5 ? suppliers.find((x) => digitsOnly(x.tax_id) === digits) : undefined;
    const k = v.kind || null;
    const wantsCustomer = !k || !supplierDocumentKinds.includes(k);
    const wantsSupplier = !k || !customerDocumentKinds.includes(k);
    setV((prev) => {
      const next = { ...prev, counterparty_tax_id: raw };
      if (wantsCustomer) {
        if (c && (!prev.customer_id || autoPicked.current.customer)) {
          next.customer_id = c.id;
          autoPicked.current.customer = true;
          if (!prev.counterparty_name.trim()) next.counterparty_name = c.name;
        } else if (!c && autoPicked.current.customer) {
          next.customer_id = null;
          autoPicked.current.customer = false;
        }
      }
      if (wantsSupplier) {
        if (s && (!prev.supplier_id || autoPicked.current.supplier)) {
          next.supplier_id = s.id;
          autoPicked.current.supplier = true;
          if (!prev.counterparty_name.trim()) next.counterparty_name = s.name;
        } else if (!s && autoPicked.current.supplier) {
          next.supplier_id = null;
          autoPicked.current.supplier = false;
        }
      }
      return next;
    });
    setDuplicate(null);
  }

  function pickEntity(which: "customer" | "supplier", id: string | null) {
    autoPicked.current[which] = false;
    const list = which === "customer" ? customers : suppliers;
    const ent = id ? list.find((x) => x.id === id) : undefined;
    setV((prev) => {
      const next = { ...prev, [`${which}_id`]: id } as DocumentFormValues;
      if (ent) {
        if (!prev.counterparty_name.trim()) next.counterparty_name = ent.name;
        if (!prev.counterparty_tax_id.trim() && ent.tax_id) next.counterparty_tax_id = ent.tax_id;
      }
      return next;
    });
  }

  // --- עזר מע״מ ---
  const num = (s: string) => {
    const n = normalizeDecimalInput(s);
    return n === "" ? null : Number(n);
  };
  const before = num(v.amount_before_vat);
  const vat = num(v.vat_amount);
  const total = num(v.amount_total);
  const valid = (n: number | null): n is number => n !== null && Number.isFinite(n);

  const vatSuggestion = ((): { label: string; apply: () => void } | null => {
    const hb = valid(before), hv = valid(vat), ht = valid(total);
    const fmt = (n: number) => String(roundMoney(n));
    if (hb && hv && !ht) {
      return {
        label: `השלמת סכום כולל: ${fmt(before + vat)}`,
        apply: () => set("amount_total", fmt(before + vat)),
      };
    }
    if (hb && ht && !hv) {
      return {
        label: `השלמת מע״מ: ${fmt(total - before)}`,
        apply: () => set("vat_amount", fmt(total - before)),
      };
    }
    if (hv && ht && !hb) {
      return {
        label: `השלמת סכום לפני מע״מ: ${fmt(total - vat)}`,
        apply: () => set("amount_before_vat", fmt(total - vat)),
      };
    }
    if (hb && !hv && !ht) {
      const vv = roundMoney(before * VAT_RATE);
      return {
        label: `חישוב מע״מ 18%: מע״מ ${fmt(vv)}, כולל ${fmt(before + vv)}`,
        apply: () =>
          setV((p) => ({ ...p, vat_amount: fmt(vv), amount_total: fmt(before + vv) })),
      };
    }
    if (ht && !hb && !hv) {
      const bb = roundMoney(total / (1 + VAT_RATE));
      return {
        label: `חישוב מע״מ 18%: לפני מע״מ ${fmt(bb)}, מע״מ ${fmt(total - bb)}`,
        apply: () =>
          setV((p) => ({ ...p, amount_before_vat: fmt(bb), vat_amount: fmt(total - bb) })),
      };
    }
    return null;
  })();

  const vatMismatch =
    valid(before) && valid(vat) && valid(total) && Math.abs(before + vat - total) > 0.05;

  function onFilePicked(f: File | null) {
    setFile(f);
    setFileError(f ? validateDocumentFile(f) : null);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current =
      f && isBrowserRenderableImage(resolveMimeType(f)) ? URL.createObjectURL(f) : null;
    setPreviewUrl(previewRef.current);
  }

  async function runDuplicateCheck(): Promise<DuplicateDocument | null | "error"> {
    if (!v.kind || !v.document_number.trim()) {
      setDuplicate(null);
      return null;
    }
    if (mode === "edit" && currentStatus === "rejected") return null;
    const res = await checkDuplicateDocument({
      kind: v.kind,
      document_number: v.document_number,
      counterparty_tax_id: v.counterparty_tax_id,
      excludeId: documentId ?? null,
    }).catch(actionCrashed);
    if (!res.ok) {
      setError(res.message);
      return "error";
    }
    setDuplicate(res.duplicate);
    return res.duplicate;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError(null);

    if (!v.kind) {
      setError("יש לבחור סוג מסמך");
      return;
    }
    if (mode === "create" && !file) {
      setError("יש לצרף קובץ — תמונה או PDF של המסמך");
      return;
    }
    if (file) {
      const fe = validateDocumentFile(file);
      if (fe) {
        setFileError(fe);
        setError(fe);
        return;
      }
    }
    const moneyFields: [keyof DocumentFormValues, string][] = [
      ["amount_before_vat", "סכום לפני מע״מ"],
      ["vat_amount", "מע״מ"],
      ["amount_total", "סכום כולל"],
    ];
    const amounts: Record<string, string> = {};
    for (const [key, label] of moneyFields) {
      const n = normalizeDecimalInput(String(v[key] ?? ""));
      if (n === "NaN") {
        setError(`${label}: יש להזין מספר`);
        return;
      }
      amounts[key] = n;
    }
    if (v.document_date && v.due_date && v.due_date < v.document_date) {
      setError("תאריך התשלום לא יכול להיות לפני תאריך המסמך");
      return;
    }

    setPending(true);
    try {
      setStage("בודק כפילות…");
      const dup = await runDuplicateCheck();
      if (dup === "error") return;
      if (dup) {
        setError("המסמך כבר הוזן במערכת (אותו סוג, ח.פ ומספר)");
        return;
      }

      let uploaded: { storage_path: string; file_name: string; mime_type: string; file_size: number } | null =
        null;
      const supabase = createClient();
      if (file) {
        setStage("מעלה קובץ…");
        const mime = resolveMimeType(file);
        const path = buildDocumentStoragePath(v.kind, file.name);
        const { error: upError } = await supabase.storage
          .from("documents")
          .upload(path, file, { contentType: mime, upsert: false });
        if (upError) {
          setError(toHebrewError(upError, "העלאת הקובץ נכשלה."));
          return;
        }
        uploaded = { storage_path: path, file_name: file.name, mime_type: mime, file_size: file.size };
      }

      setStage("שומר…");
      const payload = {
        kind: v.kind,
        document_number: v.document_number,
        document_date: v.document_date,
        due_date: v.due_date,
        counterparty_name: v.counterparty_name,
        counterparty_tax_id: v.counterparty_tax_id,
        amount_before_vat: amounts.amount_before_vat,
        vat_amount: amounts.vat_amount,
        amount_total: amounts.amount_total,
        currency: v.currency,
        notes: v.notes,
        customer_id: v.customer_id,
        supplier_id: v.supplier_id,
        order_id: linked.order?.id ?? null,
        delivery_id: linked.delivery?.id ?? null,
        payment_id: linked.payment?.id ?? null,
        expense_id: linked.expense?.id ?? null,
        source: v.source,
        file: uploaded,
      };
      const res =
        mode === "create"
          ? await createDocument(payload).catch(actionCrashed)
          : await updateDocument({ ...payload, id: documentId! }).catch(actionCrashed);

      if (!res.ok) {
        if (uploaded) {
          // ניקוי הקובץ שהועלה (מצליח רק למנהל — לסוכן נשאר קובץ יתום, וזה בסדר)
          await supabase.storage.from("documents").remove([uploaded.storage_path]).catch(() => null);
        }
        if ("duplicateId" in res && res.duplicateId) {
          await runDuplicateCheck();
        }
        setError(res.message);
        toast.error(res.message);
        return;
      }

      toast.success(mode === "create" ? "המסמך נשמר" : "המסמך עודכן");
      router.push(`/dashboard/documents/${res.id ?? documentId}`);
      router.refresh();
    } finally {
      setPending(false);
      setStage(null);
    }
  }

  const fileIsPdf = file ? resolveMimeType(file) === "application/pdf" : false;

  return (
    <FormPageShell>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {mode === "create" ? "העלאת מסמך" : "עריכת מסמך"}
              </h2>
              <p className="text-muted-foreground text-sm">
                {mode === "create"
                  ? "צילום או PDF של מסמך הנהלת חשבונות, עם הפרטים שמופיעים עליו"
                  : "עדכון הפרטים שחולצו מהמסמך"}
              </p>
            </div>

            {/* --- סוג וקובץ --- */}
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="סוג מסמך (חובה)">
                <Select
                  name="kind"
                  value={v.kind || undefined}
                  onValueChange={(val) => {
                    set("kind", val as DocumentKindDb);
                    setDuplicate(null);
                  }}
                >
                  <SelectTrigger className="w-full" aria-label="סוג מסמך">
                    <SelectValue placeholder="בחרו סוג מסמך" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {documentKindGroups.map((g) => (
                      <SelectGroup key={g.label}>
                        <SelectLabel>{g.label}</SelectLabel>
                        {g.kinds.map((k) => (
                          <SelectItem key={k} value={k}>
                            {documentKindLabels[k]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="מקור המסמך">
                <Select
                  name="source"
                  value={v.source}
                  onValueChange={(val) => set("source", val as "upload" | "whatsapp")}
                >
                  <SelectTrigger className="w-full" aria-label="מקור המסמך">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="upload">{documentSourceLabels.upload}</SelectItem>
                    <SelectItem value="whatsapp">{documentSourceLabels.whatsapp}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="flex flex-col gap-3">
              <Field
                label={
                  mode === "create"
                    ? "קובץ המסמך (תמונה או PDF, עד 20MB)"
                    : "החלפת קובץ (אופציונלי — תמונה או PDF, עד 20MB)"
                }
              >
                <Input
                  ref={fileInputRef}
                  type="file"
                  name="file"
                  accept={DOCUMENT_ACCEPT_ATTR}
                  className="cursor-pointer file:me-3 file:cursor-pointer"
                  aria-invalid={!!fileError}
                  onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)}
                />
              </Field>
              {fileError ? (
                <p className="text-destructive text-sm" role="alert">
                  {fileError}
                </p>
              ) : null}
              {file && !fileError ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- blob: preview
                    <img
                      src={previewUrl}
                      alt="תצוגה מקדימה של הקובץ שנבחר"
                      className="size-20 shrink-0 rounded-md border object-cover"
                    />
                  ) : (
                    <div className="flex size-20 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                      <FileText className="size-7 text-muted-foreground" aria-hidden />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-medium" dir="ltr" style={{ textAlign: "right" }}>
                      {file.name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {fileIsPdf ? "PDF" : "תמונה"} · {formatFileSize(file.size)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 gap-1"
                    onClick={() => {
                      onFilePicked(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <X className="size-3.5" aria-hidden />
                    הסרת הקובץ
                  </Button>
                </div>
              ) : null}
              {mode === "edit" && !file && existingFile?.file_name ? (
                <p className="text-muted-foreground text-xs">
                  קובץ נוכחי: <span dir="ltr">{existingFile.file_name}</span> ·{" "}
                  {formatFileSize(existingFile.file_size)}
                </p>
              ) : null}
            </div>

            {/* --- פרטי המסמך --- */}
            <SectionTitle title="פרטי המסמך" subtitle="כפי שמופיעים על המסמך" />
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="מספר מסמך">
                <Input
                  name="document_number"
                  dir="ltr"
                  className="text-start"
                  value={v.document_number}
                  onChange={(e) => {
                    set("document_number", e.target.value);
                    setDuplicate(null);
                  }}
                  onBlur={() => void runDuplicateCheck()}
                />
              </Field>
              <Field label="תאריך המסמך">
                <Input
                  name="document_date"
                  type="date"
                  value={v.document_date}
                  onChange={(e) => set("document_date", e.target.value)}
                />
              </Field>
              <Field label="תאריך לתשלום">
                <Input
                  name="due_date"
                  type="date"
                  value={v.due_date}
                  onChange={(e) => set("due_date", e.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="שם הצד השני (ספק / לקוח)">
                <Input
                  name="counterparty_name"
                  value={v.counterparty_name}
                  onChange={(e) => set("counterparty_name", e.target.value)}
                />
              </Field>
              <Field label="ח.פ / ע.מ של הצד השני">
                <Input
                  name="counterparty_tax_id"
                  dir="ltr"
                  inputMode="numeric"
                  className="text-start"
                  value={v.counterparty_tax_id}
                  onChange={(e) => onTaxIdChange(e.target.value)}
                  onBlur={() => void runDuplicateCheck()}
                />
              </Field>
            </div>

            {duplicate ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-destructive">
                    המסמך כבר הוזן במערכת (אותו סוג, ח.פ ומספר)
                  </p>
                  <p className="text-muted-foreground text-xs">
                    מסמך <bdi dir="ltr">#{duplicate.document_number}</bdi>
                    {duplicate.counterparty_name ? ` · ${duplicate.counterparty_name}` : ""}
                    {duplicate.document_date ? ` · ${formatDateShort(duplicate.document_date)}` : ""}
                    {` · ${documentStatusLabels[duplicate.status]}`}
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/dashboard/documents/${duplicate.id}`}>פתיחת המסמך הקיים</Link>
                </Button>
              </div>
            ) : null}

            {/* --- סכומים --- */}
            <SectionTitle title="סכומים" subtitle="אפשר להזין שניים מהשלושה ולהשלים את השלישי (מע״מ 18%)" />
            <div className="grid gap-4 md:grid-cols-4">
              <Field label="סכום לפני מע״מ">
                <Input
                  name="amount_before_vat"
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  className="text-start tabular-nums"
                  value={v.amount_before_vat}
                  onChange={(e) => set("amount_before_vat", e.target.value)}
                />
              </Field>
              <Field label="מע״מ">
                <Input
                  name="vat_amount"
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  className="text-start tabular-nums"
                  value={v.vat_amount}
                  onChange={(e) => set("vat_amount", e.target.value)}
                />
              </Field>
              <Field label="סכום כולל מע״מ">
                <Input
                  name="amount_total"
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  className="text-start tabular-nums"
                  value={v.amount_total}
                  onChange={(e) => set("amount_total", e.target.value)}
                />
              </Field>
              <Field label="מטבע">
                <Select name="currency" value={v.currency} onValueChange={(val) => set("currency", val)}>
                  <SelectTrigger className="w-full" aria-label="מטבע">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {CURRENCY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                    {!CURRENCY_OPTIONS.some((c) => c.value === v.currency) ? (
                      <SelectItem value={v.currency}>{v.currency}</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {vatSuggestion || vatMismatch ? (
              <div className="-mt-2 flex flex-wrap items-center gap-3">
                {vatSuggestion ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={vatSuggestion.apply}
                  >
                    <Calculator className="size-3.5" aria-hidden />
                    {vatSuggestion.label}
                  </Button>
                ) : null}
                {vatMismatch ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    שימו לב: לפני מע״מ + מע״מ אינו שווה לסכום הכולל
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* --- קישורים --- */}
            <SectionTitle title="שיוך" subtitle="לקוח או ספק — נבחר אוטומטית כשהח.פ קיים במערכת" />
            <div className="grid gap-4 md:grid-cols-2">
              {showCustomer ? (
                <EntityPicker
                  label="לקוח מקושר"
                  name="customer_id"
                  options={customers}
                  value={v.customer_id}
                  onChange={(id) => pickEntity("customer", id)}
                  placeholder="חיפוש לקוח לפי שם או ח.פ…"
                  hint={
                    matchCustomer && v.customer_id === matchCustomer.id
                      ? `נמצא: ${matchCustomer.name} (לקוח, לפי ח.פ)`
                      : null
                  }
                />
              ) : null}
              {showSupplier ? (
                <EntityPicker
                  label="ספק מקושר"
                  name="supplier_id"
                  options={suppliers}
                  value={v.supplier_id}
                  onChange={(id) => pickEntity("supplier", id)}
                  placeholder="חיפוש ספק לפי שם או ח.פ…"
                  hint={
                    matchSupplier && v.supplier_id === matchSupplier.id
                      ? `נמצא: ${matchSupplier.name} (ספק, לפי ח.פ)`
                      : null
                  }
                />
              ) : null}
            </div>
            {(["order", "delivery", "payment", "expense"] as const).some((k) => linked[k]) ? (
              <ul className="flex flex-wrap gap-2">
                {(["order", "delivery", "payment", "expense"] as const).map((k) => {
                  const ref = linked[k];
                  if (!ref) return null;
                  return (
                    <li
                      key={k}
                      className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-sm"
                    >
                      <Link2 className="size-3.5 text-muted-foreground" aria-hidden />
                      <Link href={ref.href} className="hover:underline">
                        {ref.label}
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-xs"
                        aria-label={`הסרת קישור: ${ref.label}`}
                        onClick={() => setLinked((p) => ({ ...p, [k]: undefined }))}
                      >
                        <X className="size-3" aria-hidden />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <Field label="הערות">
              <Textarea
                name="notes"
                rows={3}
                value={v.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>

            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <FormStickyFooter>
          <Button type="button" variant="outline" onClick={() => router.push(cancelHref)}>
            ביטול
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? (stage ?? "שומר…") : mode === "create" ? "שמירת המסמך" : "שמירת השינויים"}
          </Button>
        </FormStickyFooter>
      </form>
    </FormPageShell>
  );
}
