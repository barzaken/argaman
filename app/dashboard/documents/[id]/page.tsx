import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CalendarClock,
  Download,
  ExternalLink,
  FileText,
  Hash,
  Inbox,
  Pencil,
  User,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DocumentStatusBadge } from "@/components/documents/document-badges";
import { DocumentStatusActions } from "@/components/documents/document-status-actions";
import {
  formatFileSize,
  isBrowserRenderableImage,
} from "@/components/documents/upload-utils";
import { Button } from "@/components/ui/button";
import { formatDateShort, formatIlsDense, formatIssueDate } from "@/lib/db/format";
import { documentKindLabels, documentSourceLabels } from "@/lib/db/labels";
import type { DocumentViewRow } from "@/lib/db/types";
import { getCurrentCrmUser } from "@/lib/supabase/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const linkRowClass =
  "block rounded-lg border border-border bg-card shadow-sm transition-colors hover:bg-muted/30 hover:border-muted-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function DetailRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className={cn("mt-0.5 font-medium text-foreground", mono && "tabular-nums tracking-tight")}>
          {value ?? <span className="text-muted-foreground font-normal">—</span>}
        </p>
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-y border-border px-4 py-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {subtitle ? <p className="text-muted-foreground text-xs">{subtitle}</p> : null}
    </div>
  );
}

function money(n: number | null, currency: string) {
  if (n == null) return null;
  return currency === "ILS" ? formatIlsDense(Number(n)) : `${Number(n).toLocaleString("he-IL")} ${currency}`;
}

type NextStep = { label: string; description: string; href: string } | null;

function nextStepFor(d: DocumentViewRow): NextStep {
  const qs = (params: Record<string, string | number | null | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== "") sp.set(k, String(v));
    return sp.toString();
  };
  switch (d.kind) {
    case "customer_receipt":
      if (d.payment_id) return null;
      return {
        label: "רישום תשלום מהקבלה",
        description: "פותח טופס תשלום עם הלקוח והסכום מהמסמך",
        href: `/dashboard/payments/new?${qs({ document: d.id, customer: d.customer_id, amount: d.amount_total })}`,
      };
    case "supplier_invoice":
    case "supplier_receipt":
    case "expense_receipt":
      if (d.expense_id) return null;
      return {
        label: "רישום כהוצאה",
        description: "פותח טופס הוצאה עם הספק מהמסמך",
        href: `/dashboard/expenses/new?${qs({ document: d.id, supplier: d.supplier_id })}`,
      };
    case "supplier_delivery_note":
      return {
        label: "קליטה למלאי",
        description: "פותח טופס הוספה למלאי עם הספק מהמסמך",
        href: `/dashboard/inventory/new?${qs({ document: d.id, supplier: d.supplier_id })}`,
      };
    case "signed_delivery_note":
      if (!d.delivery_id) return null;
      return {
        label: `פתיחת תעודת משלוח #${d.delivery_number ?? ""}`,
        description: "התעודה החתומה שייכת למשלוח הזה",
        href: `/dashboard/deliveries/${d.delivery_id}`,
      };
    default:
      return null;
  }
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data, error }, me] = await Promise.all([
    supabase.from("documents_view").select("*").eq("id", id).single(),
    getCurrentCrmUser(),
  ]);
  if (error || !data) notFound();
  const d = data as DocumentViewRow;

  let viewUrl: string | null = null;
  let downloadUrl: string | null = null;
  let fileError: string | null = null;
  if (d.storage_path) {
    const bucket = supabase.storage.from("documents");
    const [view, dl] = await Promise.all([
      bucket.createSignedUrl(d.storage_path, 600),
      bucket.createSignedUrl(d.storage_path, 600, { download: d.file_name ?? true }),
    ]);
    viewUrl = view.data?.signedUrl ?? null;
    downloadUrl = dl.data?.signedUrl ?? null;
    if (view.error) fileError = "הקובץ לא נמצא באחסון.";
  }

  const isPdf = d.mime_type === "application/pdf";
  const canRenderImage = isBrowserRenderableImage(d.mime_type);
  const next = nextStepFor(d);

  const related: { label: string; href: string }[] = [];
  if (d.customer_id) related.push({ label: `לקוח: ${d.customer_name ?? ""}`, href: `/dashboard/customers/${d.customer_id}` });
  if (d.supplier_id) related.push({ label: `ספק: ${d.supplier_name ?? ""}`, href: `/dashboard/suppliers/${d.supplier_id}` });
  if (d.order_id) related.push({ label: `הזמנה #${d.order_number ?? ""}`, href: `/dashboard/orders/${d.order_id}` });
  if (d.delivery_id) related.push({ label: `תעודת משלוח #${d.delivery_number ?? ""}`, href: `/dashboard/deliveries/${d.delivery_id}` });
  if (d.payment_id) related.push({ label: `תשלום #${d.payment_number ?? ""}`, href: `/dashboard/payments/${d.payment_id}` });
  if (d.expense_id) related.push({ label: "הוצאה מקושרת", href: `/dashboard/expenses/${d.expense_id}` });

  const title = `${documentKindLabels[d.kind] ?? d.kind}${d.document_number ? ` #${d.document_number}` : ""}`;
  const kindLabel = documentKindLabels[d.kind] ?? d.kind;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="border-b border-border px-4 py-2">
        <Link
          href="/dashboard/documents"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowRight className="size-3.5 shrink-0 opacity-70" aria-hidden />
          כל המסמכים
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">
              {kindLabel}
              {d.document_number ? (
                <>
                  {" "}
                  <bdi dir="ltr" className="tabular-nums">#{d.document_number}</bdi>
                </>
              ) : null}
            </h2>
            <DocumentStatusBadge status={d.status} />
          </div>
          <p className="text-muted-foreground text-xs">
            {documentSourceLabels[d.source] ?? d.source} · הועלה {formatIssueDate(d.created_at)}
            {d.reviewed_at ? ` · נבדק ${formatIssueDate(d.reviewed_at)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DocumentStatusActions documentId={d.id} status={d.status} isAdmin={!!me?.isAdmin} />
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
            <Link href={`/dashboard/documents/${d.id}/edit`}>
              <Pencil className="size-3.5" aria-hidden />
              עריכת פרטים
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* צפייה בקובץ */}
        <div className="flex min-h-[24rem] flex-[3] flex-col border-border lg:min-h-0 lg:border-l">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
            <p className="text-muted-foreground min-w-0 truncate text-xs">
              {d.file_name ? (
                <>
                  <span dir="ltr">{d.file_name}</span> · {formatFileSize(d.file_size)}
                </>
              ) : (
                "אין קובץ מצורף"
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {viewUrl ? (
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5" aria-hidden />
                    פתיחה בחלון חדש
                  </a>
                </Button>
              ) : null}
              {downloadUrl ? (
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <a href={downloadUrl}>
                    <Download className="size-3.5" aria-hidden />
                    הורדת הקובץ
                  </a>
                </Button>
              ) : null}
              {d.green_invoice_url ? (
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <a href={d.green_invoice_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5" aria-hidden />
                    פתיחה ב-Green Invoice
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/30 p-4">
            {viewUrl && canRenderImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL קצר-מועד מ-Supabase Storage
              <img
                src={viewUrl}
                alt={`צילום המסמך: ${title}`}
                className="max-h-full max-w-full rounded-md border bg-background object-contain shadow-sm"
              />
            ) : viewUrl && isPdf ? (
              <iframe
                src={viewUrl}
                title={`קובץ PDF: ${title}`}
                className="h-full min-h-[32rem] w-full rounded-md border bg-background"
              />
            ) : (
              <div className="text-muted-foreground flex flex-col items-center gap-2 text-center text-sm">
                <FileText className="size-10 text-zinc-300 dark:text-zinc-600" aria-hidden />
                {fileError ??
                  (viewUrl
                    ? "לא ניתן להציג תצוגה מקדימה לקובץ מסוג זה — פתחו אותו בחלון חדש."
                    : d.green_invoice_url
                      ? "המסמך קיים ב-Green Invoice בלבד."
                      : "לא צורף קובץ למסמך זה.")}
              </div>
            )}
          </div>
        </div>

        {/* פרטים */}
        <div className="flex min-h-0 flex-[2] flex-col overflow-auto">
          {next ? (
            <div className="border-b border-border p-4">
              <Link href={next.href} className={cn(linkRowClass, "flex items-center justify-between gap-3 px-3 py-3")}>
                <div>
                  <p className="text-sm font-semibold text-foreground">הצעד הבא: {next.label}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">{next.description}</p>
                </div>
                <ArrowLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </div>
          ) : null}

          <div className="px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">פרטי המסמך</h2>
            <p className="text-muted-foreground text-xs">{documentKindLabels[d.kind]}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 px-4 pb-4">
            <DetailRow icon={Hash} label="מספר מסמך" value={d.document_number} mono />
            <DetailRow icon={Calendar} label="תאריך המסמך" value={d.document_date ? formatDateShort(d.document_date) : null} mono />
            <DetailRow icon={CalendarClock} label="תאריך לתשלום" value={d.due_date ? formatDateShort(d.due_date) : null} mono />
            <DetailRow icon={Inbox} label="מקור" value={documentSourceLabels[d.source] ?? d.source} />
            <DetailRow icon={User} label="צד שני" value={d.counterparty_name} />
            <DetailRow icon={Hash} label="ח.פ / ע.מ" value={d.counterparty_tax_id} mono />
          </div>

          <SectionHeader title="סכומים" subtitle={d.currency !== "ILS" ? `מטבע: ${d.currency}` : undefined} />
          <dl className="flex flex-col gap-2 p-4 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">סכום לפני מע״מ</dt>
              <dd className="tabular-nums">{money(d.amount_before_vat, d.currency) ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">מע״מ</dt>
              <dd className="tabular-nums">{money(d.vat_amount, d.currency) ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2 border-t border-border pt-2 font-semibold">
              <dt>סכום כולל</dt>
              <dd className="tabular-nums">{money(d.amount_total, d.currency) ?? "—"}</dd>
            </div>
          </dl>

          <SectionHeader title="קישורים" subtitle="רשומות במערכת שהמסמך שייך אליהן" />
          <ul className="flex flex-col gap-2 p-4">
            {related.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className={cn(linkRowClass, "px-3 py-2.5 text-sm font-medium")}>
                  {r.label}
                </Link>
              </li>
            ))}
            {related.length === 0 ? (
              <li className="text-muted-foreground py-4 text-center text-sm">
                המסמך לא מקושר ללקוח, ספק או רשומה אחרת.{" "}
                <Link href={`/dashboard/documents/${d.id}/edit`} className="underline">
                  שיוך בעריכת פרטים
                </Link>
              </li>
            ) : null}
          </ul>

          {d.notes ? (
            <>
              <SectionHeader title="הערות" />
              <p className="whitespace-pre-wrap p-4 text-sm">{d.notes}</p>
            </>
          ) : null}

          {d.extracted && Object.keys(d.extracted).length > 0 ? (
            <details className="border-t border-border px-4 py-3 text-sm">
              <summary className="cursor-pointer font-semibold">נתונים שחולצו אוטומטית</summary>
              <pre dir="ltr" className="mt-2 overflow-auto rounded-md bg-muted/40 p-3 text-xs">
                {JSON.stringify(d.extracted, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
