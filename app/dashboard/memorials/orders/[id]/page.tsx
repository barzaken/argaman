import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

import {
  AddReminderForm,
  ApprovalPanel,
  MorningDocsPanel,
  OrderImages,
  PaymentsPanel,
  ReminderDoneButton,
  StageStepper,
  type ApprovalItem,
  type DocItem,
  type PaymentItem,
} from "@/components/memorials/order-panels";
import { ContactButtons, InfoRow, Section, StageBadge } from "@/components/memorials/ui";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { isGreenInvoiceConfigured } from "@/lib/green-invoice/config";
import { formatDateShort, formatIls } from "@/lib/db/format";
import { leadWhatsAppText } from "@/lib/memorials/contact";
import { publicBaseUrl } from "@/lib/memorials/public-url";
import { MEM_ORDER_KIND_LABELS, type MemOrderRow } from "@/lib/memorials/constants";

export default async function MemorialOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: order }, imgs, pays, docs, apprs, rems] = await Promise.all([
    supabase.from("mem_orders").select("*").eq("id", id).maybeSingle(),
    supabase.from("mem_images").select("id, kind, created_at").eq("order_id", id).order("created_at"),
    supabase.from("mem_payments").select("id, amount, method, paid_at, is_deposit, note, document_id").eq("order_id", id).order("paid_at"),
    supabase.from("mem_documents").select("id, doc_type, amount, morning_number, url, status, created_at, description").eq("order_id", id).order("created_at"),
    supabase.from("mem_approvals").select("id, token, status, created_at, signed_at, signer_name, wording").eq("order_id", id).order("created_at", { ascending: false }),
    supabase.from("mem_reminders").select("id, kind, due_date, title, done_at").eq("order_id", id).order("due_date"),
  ]);
  if (!order) notFound();
  const o = order as MemOrderRow;
  const payments = (pays.data ?? []) as PaymentItem[];
  const paidTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = o.price !== null ? Number(o.price) - paidTotal : null;
  const base = await publicBaseUrl();

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-auto p-4 md:p-6">
      <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-4">
          <Section
            title={`הזמנה #${o.number} · ${MEM_ORDER_KIND_LABELS[o.kind]}`}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <StageBadge stage={o.stage} />
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/dashboard/memorials/orders/${o.id}/edit`}>
                    <Pencil />
                    עריכה
                  </Link>
                </Button>
              </div>
            }
          >
            <StageStepper orderId={o.id} stage={o.stage} />
          </Section>

          <Section title="פרטים" actions={<ContactButtons phone={o.phone} whatsappText={leadWhatsAppText({ name: o.customer_name, source: "contact" })} />}>
            <dl className="grid gap-3 sm:grid-cols-3">
              <InfoRow label="לקוח" value={o.customer_name} />
              <InfoRow label="טלפון" value={o.phone} ltr />
              <InfoRow label="דוא״ל" value={o.email} ltr />
              <InfoRow label="כתובת" value={[o.address, o.city].filter(Boolean).join(", ")} />
              <InfoRow label="נפטר/ת" value={o.deceased_name} />
              <InfoRow label="תאריך פטירה" value={o.death_date ? `${formatDateShort(o.death_date)}${o.hebrew_death_date ? ` · ${o.hebrew_death_date}` : ""}` : o.hebrew_death_date} />
              <InfoRow label="בית עלמין" value={o.cemetery} />
              <InfoRow label="מיקום הקבר" value={o.grave_location} />
              <InfoRow label="תאריך התקנה" value={o.installation_date ? formatDateShort(o.installation_date) : null} />
              <InfoRow label="מחיר" value={o.price !== null ? formatIls(Number(o.price)) : null} />
              <InfoRow label="שולם" value={formatIls(paidTotal)} />
              <InfoRow label="יתרה" value={balance !== null ? formatIls(balance) : null} />
              {o.design_url ? (
                <InfoRow
                  label="עיצוב באתר"
                  value={
                    <a href={o.design_url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
                      פתיחה
                    </a>
                  }
                />
              ) : null}
              {o.lead_id ? (
                <InfoRow
                  label="ליד מקורי"
                  value={
                    <Link href={`/dashboard/memorials/leads/${o.lead_id}`} className="text-primary underline underline-offset-4">
                      כרטיס הליד
                    </Link>
                  }
                />
              ) : null}
              {o.cancel_reason ? <InfoRow label="סיבת ביטול" value={o.cancel_reason} /> : null}
            </dl>
            {o.notes ? <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">{o.notes}</p> : null}
          </Section>

          <Section title="הדמיות ותמונות">
            <OrderImages orderId={o.id} images={imgs.data ?? []} />
          </Section>

          <Section title="נוסח ואישור המשפחה (חתימה דיגיטלית)">
            <ApprovalPanel
              orderId={o.id}
              customerName={o.customer_name}
              phone={o.phone}
              wording={o.wording}
              images={imgs.data ?? []}
              approvals={(apprs.data ?? []) as ApprovalItem[]}
              publicBaseUrl={base}
            />
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          <Section title="תשלומים">
            <PaymentsPanel orderId={o.id} payments={payments} />
          </Section>
          <Section title="מסמכי Morning">
            <MorningDocsPanel
              orderId={o.id}
              stage={o.stage}
              hasEmail={!!o.email}
              defaultDescription={`${MEM_ORDER_KIND_LABELS[o.kind]}${o.deceased_name ? ` — ${o.deceased_name} ז״ל` : ""}${o.cemetery ? `, ${o.cemetery}` : ""}`}
              price={o.price !== null ? Number(o.price) : null}
              paidTotal={paidTotal}
              payments={payments}
              docs={(docs.data ?? []) as DocItem[]}
              morningConfigured={isGreenInvoiceConfigured()}
            />
          </Section>
          <Section title="תזכורות (שלושים, אזכרה, מעקב)">
            {rems.data?.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {rems.data.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className={r.done_at ? "text-muted-foreground line-through" : ""}>
                      {formatDateShort(r.due_date)} · {r.title}
                    </span>
                    {!r.done_at ? <ReminderDoneButton id={r.id} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">תזכורות שלושים ואזכרה נוצרות לבד כשממלאים תאריך פטירה.</p>
            )}
            <AddReminderForm orderId={o.id} />
          </Section>
        </div>
      </div>
    </div>
  );
}
