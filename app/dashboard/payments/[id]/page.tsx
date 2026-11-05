import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CreditCard,
  ExternalLink,
  FileText,
  Hash,
  Landmark,
  StickyNote,
  User,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AllocateRemaining } from "./allocate-remaining";
import { DeletePaymentButton } from "./delete-payment-button";
import { GreenInvoiceReceiptButton } from "@/components/green-invoice/receipt-button";
import { KpiCard } from "@/components/kpi-card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { OpenDelivery } from "@/components/payments/allocation-utils";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCrmUser } from "@/lib/supabase/auth-helpers";
import { formatDateShort, formatIls } from "@/lib/db/format";
import {
  documentKindLabels,
  documentStatusLabels,
  paymentMethodLabels,
} from "@/lib/db/labels";
import type {
  DocumentKindDb,
  DocumentStatusDb,
  PaymentAllocationViewRow,
  PaymentViewRow,
} from "@/lib/db/types";
import { isGreenInvoiceConfigured } from "@/lib/green-invoice/config";
import { hasIssuedGiId } from "@/lib/green-invoice/status";
import { cn } from "@/lib/utils";

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
  if (value == null || value === "") return null;
  return (
    <div className="flex gap-3 text-sm">
      <Icon
        className="mt-0.5 size-4 shrink-0 text-zinc-300 dark:text-zinc-600"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <div
          className={cn(
            "mt-0.5 font-medium text-foreground",
            mono && "tabular-nums tracking-tight"
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

type LinkedDoc = {
  id: string;
  kind: DocumentKindDb;
  status: DocumentStatusDb;
  document_number: string | null;
  amount_total: number | null;
};

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();

  const [{ data: payRows, error }, { data: allocRows }, { data: docRows }, me] =
    await Promise.all([
      supabase.from("payments_view").select("*").eq("id", id).limit(1),
      supabase
        .from("payment_allocations_view")
        .select("*")
        .eq("payment_id", id)
        .order("delivery_number", { ascending: true }),
      supabase
        .from("documents")
        .select("id, kind, status, document_number, amount_total")
        .eq("payment_id", id),
      getCurrentCrmUser(),
    ]);

  const p = payRows?.[0] as PaymentViewRow | undefined;
  if (error || !p) notFound();

  const configured = isGreenInvoiceConfigured();
  const allocations = (allocRows ?? []) as PaymentAllocationViewRow[];
  const docs = [...((docRows ?? []) as LinkedDoc[])];
  if (p.document_id && !docs.some((d) => d.id === p.document_id)) {
    const { data: extra } = await supabase
      .from("documents")
      .select("id, kind, status, document_number, amount_total")
      .eq("id", p.document_id)
      .limit(1);
    if (extra?.[0]) docs.unshift(extra[0] as LinkedDoc);
  }

  const unallocated = Number(p.unallocated_amount);
  let openDeliveries: OpenDelivery[] = [];
  if (unallocated > 0.005) {
    const { data: open } = await supabase
      .from("debtors_view")
      .select(
        "delivery_id, delivery_number, order_number, customer_id, payment_due_date, total, amount_paid, balance"
      )
      .eq("customer_id", p.customer_id)
      .gt("balance", 0)
      .order("delivery_number", { ascending: true });
    openDeliveries = (open ?? []) as OpenDelivery[];
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <Link
          href="/dashboard/payments"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowRight className="size-3.5 shrink-0 opacity-70" aria-hidden />
          כל התשלומים
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/payments/new?customer=${p.customer_id}`}>
              תשלום נוסף ללקוח
            </Link>
          </Button>
          {me?.isAdmin ? (
            <DeletePaymentButton
              paymentId={p.id}
              paymentNumber={p.payment_number}
              deliveryNumbers={allocations.map((a) => a.delivery_number)}
            />
          ) : null}
        </div>
      </div>

      <div className="grid border-b border-border grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="סכום התשלום"
          value={Number(p.amount)}
          icon="wallet"
          valueType="currency"
        />
        <KpiCard
          label="שויך לתעודות"
          value={Number(p.allocated_amount)}
          icon="clipboard-check"
          valueType="currency"
        />
        <KpiCard
          label="זיכוי לא משויך"
          value={Math.max(0, unallocated)}
          icon="file-warning"
          valueType="currency"
        />
        <KpiCard
          label="תעודות ששויכו"
          value={allocations.length}
          icon="truck"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:flex-row lg:overflow-hidden">
        <div className="flex flex-col border-border lg:min-h-0 lg:flex-[2] lg:overflow-auto lg:border-l">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              תשלום #{p.payment_number}
            </h2>
            <p className="text-muted-foreground text-xs">פרטי התשלום</p>
          </div>

          <div className="flex flex-col gap-4 p-4">
            <DetailRow
              icon={User}
              label="לקוח"
              value={
                <Link
                  href={`/dashboard/customers/${p.customer_id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {p.customer_name}
                </Link>
              }
            />
            <DetailRow icon={Hash} label="ח.פ / ת״ז" value={p.customer_tax_id} mono />
            <DetailRow
              icon={CalendarDays}
              label="תאריך תשלום"
              value={formatDateShort(p.paid_at)}
              mono
            />
            <DetailRow
              icon={CreditCard}
              label="אמצעי תשלום"
              value={paymentMethodLabels[p.method] ?? p.method}
            />
            <DetailRow
              icon={Hash}
              label="אסמכתא (מס׳ צ׳ק / העברה)"
              value={p.reference}
              mono
            />
            <DetailRow icon={Landmark} label="בנק" value={p.bank_name} />
            <DetailRow icon={StickyNote} label="הערות" value={p.notes} />
            <DetailRow
              icon={CalendarDays}
              label="נרשם במערכת"
              value={formatDateShort(p.created_at)}
              mono
            />
          </div>

          <div className="border-y border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">מסמכים מקושרים</h2>
            <p className="text-muted-foreground text-xs">
              צילום צ׳ק / אישור העברה / קבלה
            </p>
          </div>
          <ul className="flex flex-col gap-2 p-4">
            {docs.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/dashboard/documents/${d.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm transition-colors hover:bg-muted/30"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" aria-hidden />
                    {documentKindLabels[d.kind] ?? "מסמך"}
                    {d.document_number ? ` #${d.document_number}` : ""}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {d.amount_total != null ? formatIls(Number(d.amount_total)) : ""}
                    {" · "}
                    {documentStatusLabels[d.status]}
                  </span>
                </Link>
              </li>
            ))}
            {docs.length === 0 ? (
              <li className="text-muted-foreground py-2 text-sm">
                אין מסמך מקושר לתשלום.
              </li>
            ) : null}
          </ul>

          <div className="border-y border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              קבלה ב-Green Invoice
            </h2>
          </div>
          <div className="flex flex-col gap-3 p-4">
            {p.green_invoice_receipt_number || p.green_invoice_url ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <DetailRow
                  icon={Building2}
                  label="מס׳ קבלה"
                  value={p.green_invoice_receipt_number ?? "—"}
                  mono
                />
                {p.green_invoice_url ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={p.green_invoice_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink data-icon="inline-start" />
                      פתיחת הקבלה
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                עדיין לא הופקה קבלה לתשלום זה.
              </p>
            )}
            {!p.green_invoice_url ? (
              <div>
                <GreenInvoiceReceiptButton
                  paymentId={p.id}
                  hasReceipt={hasIssuedGiId(p.green_invoice_receipt_id)}
                  greenInvoiceUrl={p.green_invoice_url}
                  configured={configured}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col lg:min-h-0 lg:flex-[3] lg:overflow-auto">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              שיוך לתעודות משלוח
            </h2>
            <p className="text-muted-foreground text-xs">
              אילו תעודות התשלום הזה משלם, ובאיזה סכום
            </p>
          </div>
          <div className="p-4">
            <div className="overflow-hidden rounded-md border bg-card">
              <Table dir="rtl">
                <TableHeader>
                  <TableRow>
                    <TableHead>תעודת משלוח</TableHead>
                    <TableHead>הזמנה</TableHead>
                    <TableHead className="text-end">סכום התעודה</TableHead>
                    <TableHead className="text-end">שויך מתשלום זה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocations.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link
                          href={`/dashboard/deliveries/${a.delivery_id}`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          משלוח #{a.delivery_number}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums">#{a.order_number}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatIls(Number(a.delivery_total))}
                      </TableCell>
                      <TableCell className="text-end tabular-nums font-medium">
                        {formatIls(Number(a.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                  {allocations.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-16 text-center text-muted-foreground"
                      >
                        התשלום עדיין לא שויך לאף תעודה.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </div>

          {unallocated > 0.005 ? (
            <div className="border-t border-border p-4">
              <AllocateRemaining
                paymentId={p.id}
                unallocated={unallocated}
                deliveries={openDeliveries}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
