import Link from "next/link";
import { ImageIcon } from "lucide-react";

import { KpiCard } from "@/components/kpi-card";
import { ContactButtons, StageBadge } from "@/components/memorials/ui";
import { ReminderDoneButton } from "@/components/memorials/order-panels";
import { createClient } from "@/lib/supabase/server";
import { formatDateShort, formatIls, startOfMonthInIsraelIso, todayIsoInIsrael } from "@/lib/db/format";
import { toHebrewError } from "@/lib/db/errors";
import { leadWhatsAppText, reminderWhatsAppText } from "@/lib/memorials/contact";
import {
  MEM_LEAD_SOURCE_LABELS,
  MEM_ORDER_KIND_LABELS,
  MEM_PIPELINE_STAGES,
  MEM_STAGE_LABELS,
  memImageUrl,
  type MemLeadSource,
  type MemOrderKind,
  type MemStage,
} from "@/lib/memorials/constants";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const STAGE_ORDER = new Map(MEM_PIPELINE_STAGES.map((s, i) => [s, i]));
const MAX_ORDER_CARDS = 24;

function PaneHeader({ title, subtitle, href, linkLabel }: { title: string; subtitle: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </div>
      {href ? (
        <Link href={href} className="text-muted-foreground shrink-0 text-xs transition-colors hover:text-foreground hover:underline">
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

function Thumb({ imageId, alt, className }: { imageId: string | undefined; alt: string; className: string }) {
  if (!imageId) {
    return (
      <div className={`bg-muted/50 text-muted-foreground/40 flex items-center justify-center ${className}`} aria-hidden>
        <ImageIcon className="size-6" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={memImageUrl(imageId)} alt={alt} loading="lazy" className={`bg-muted/30 object-contain ${className}`} />
  );
}

export default async function MemorialsHomePage() {
  const supabase = await createClient();
  const today = todayIsoInIsrael();
  const monthStartDate = `${today.slice(0, 8)}01`;

  const [newLeads, monthLeads, orders, reminders, payments, pendingApprovals] = await Promise.all([
    supabase
      .from("mem_leads")
      .select("id, created_at, name, phone, source, deceased_name")
      .eq("status", "new")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("mem_leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfMonthInIsraelIso())
      .neq("status", "spam"),
    supabase
      .from("mem_orders")
      .select("id, number, stage, kind, customer_name, deceased_name, installation_date, price, lead_id, updated_at")
      .not("stage", "in", "(done,cancelled)")
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase
      .from("mem_reminders")
      .select("id, kind, due_date, title, order_id, lead_id, mem_orders(customer_name, phone, deceased_name), mem_leads(name, phone)")
      .is("done_at", null)
      .lte("due_date", addDays(today, 7))
      .order("due_date")
      .limit(50),
    supabase.from("mem_payments").select("order_id, amount, paid_at").limit(10000),
    supabase.from("mem_approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const err = newLeads.error ?? orders.error ?? reminders.error ?? payments.error;
  const openOrders = orders.data ?? [];
  const leadsToCall = newLeads.data ?? [];

  const byStage = new Map<MemStage, number>();
  for (const o of openOrders) byStage.set(o.stage as MemStage, (byStage.get(o.stage as MemStage) ?? 0) + 1);

  const paidByOrder = new Map<string, number>();
  let paidThisMonth = 0;
  for (const p of payments.data ?? []) {
    const amount = Number(p.amount);
    paidByOrder.set(p.order_id, (paidByOrder.get(p.order_id) ?? 0) + amount);
    if (p.paid_at >= monthStartDate) paidThisMonth += amount;
  }
  const balanceOf = (o: { id: string; price: number | string | null }) =>
    o.price == null ? 0 : Math.max(0, Number(o.price) - (paidByOrder.get(o.id) ?? 0));
  const balanceTotal = openOrders.reduce((sum, o) => sum + balanceOf(o), 0);

  const in30 = addDays(today, 30);
  const installsSoon = openOrders.filter((o) => o.installation_date && o.installation_date >= today && o.installation_date <= in30).length;

  // כרטיסי הזמנות: התקנה קרובה קודם, אחר כך לפי שלב (מתקדם קודם)
  const orderCards = [...openOrders]
    .sort((a, b) => {
      const ai = a.installation_date && a.installation_date >= today ? a.installation_date : "9999";
      const bi = b.installation_date && b.installation_date >= today ? b.installation_date : "9999";
      if (ai !== bi) return ai < bi ? -1 : 1;
      return (STAGE_ORDER.get(b.stage as MemStage) ?? 0) - (STAGE_ORDER.get(a.stage as MemStage) ?? 0);
    })
    .slice(0, MAX_ORDER_CARDS);

  // תמונה אחרונה (הדמיה / עיצוב) לכל הזמנה וליד
  const orderIds = orderCards.map((o) => o.id);
  const leadIds = [...new Set([...leadsToCall.map((l) => l.id), ...orderCards.map((o) => o.lead_id).filter(Boolean)])] as string[];
  const [orderImgs, leadImgs] = await Promise.all([
    orderIds.length
      ? supabase.from("mem_images").select("id, order_id").in("order_id", orderIds).in("kind", ["render", "design"]).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; order_id: string }[] }),
    leadIds.length
      ? supabase.from("mem_images").select("id, lead_id").in("lead_id", leadIds).in("kind", ["render", "design"]).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; lead_id: string }[] }),
  ]);
  const orderImage = new Map<string, string>();
  for (const i of orderImgs.data ?? []) if (i.order_id && !orderImage.has(i.order_id)) orderImage.set(i.order_id, i.id);
  const leadImage = new Map<string, string>();
  for (const i of leadImgs.data ?? []) if (i.lead_id && !leadImage.has(i.lead_id)) leadImage.set(i.lead_id, i.id);

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="grid grid-cols-2 border-b sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]">
        <KpiCard label="לידים להתקשר" value={leadsToCall.length} icon="inbox" />
        <KpiCard label="לידים החודש" value={monthLeads.count ?? 0} icon="users" />
        <KpiCard label="הזמנות פתוחות" value={openOrders.length} icon="clipboard-check" />
        <KpiCard label="התקנות ב-30 יום" value={installsSoon} icon="truck" />
        <KpiCard label="ממתינות לחתימה" value={pendingApprovals.count ?? 0} icon="file-warning" />
        <KpiCard label="תשלומים החודש" value={Math.round(paidThisMonth)} icon="wallet" valueType="currency" />
        <KpiCard label="יתרה לגבייה" value={Math.round(balanceTotal)} icon="circle-dollar-sign" valueType="currency" />
        <KpiCard label="תזכורות השבוע" value={reminders.data?.length ?? 0} icon="calendar" />
      </div>

      {err ? <p className="text-destructive px-4 pt-3 text-sm">{toHebrewError(err, "טעינת הנתונים נכשלה")}</p> : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-[3] flex-col overflow-auto border-border lg:border-l">
          <PaneHeader title="הזמנות בעבודה" subtitle="התקנות קרובות קודם" href="/dashboard/memorials/orders" linkLabel="ללוח ההזמנות" />
          <ol className="grid grid-cols-4 border-b border-border sm:grid-cols-7">
            {MEM_PIPELINE_STAGES.map((s, i) => (
              <li key={s} className={i > 0 ? "border-border sm:border-r" : ""}>
                <Link href="/dashboard/memorials/orders" className="flex flex-col items-center gap-0.5 px-2 py-3 transition-colors hover:bg-muted/40">
                  <span className="text-xl font-semibold tabular-nums">{byStage.get(s) ?? 0}</span>
                  <span className="text-muted-foreground text-xs">{MEM_STAGE_LABELS[s]}</span>
                </Link>
              </li>
            ))}
          </ol>
          <ul className="grid list-none gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {orderCards.map((o) => {
              const balance = balanceOf(o);
              const img = orderImage.get(o.id) ?? (o.lead_id ? leadImage.get(o.lead_id) : undefined);
              return (
                <li key={o.id}>
                  <Link
                    href={`/dashboard/memorials/orders/${o.id}`}
                    className="block overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors hover:border-muted-foreground/25 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Thumb imageId={img} alt={`הדמיה — ${o.customer_name}`} className="h-36 w-full border-b border-border" />
                    <div className="flex flex-col gap-1.5 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold">
                          #{o.number} · {o.customer_name}
                        </p>
                        <StageBadge stage={o.stage as MemStage} />
                      </div>
                      <p className="text-muted-foreground truncate text-xs">
                        {MEM_ORDER_KIND_LABELS[o.kind as MemOrderKind]}
                        {o.deceased_name ? ` · ז״ל ${o.deceased_name}` : ""}
                      </p>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">
                          {o.installation_date ? `התקנה ${formatDateShort(o.installation_date)}` : "ללא תאריך התקנה"}
                        </span>
                        {balance > 0 ? <span className="tabular-nums">יתרה {formatIls(Math.round(balance))}</span> : null}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
            {orderCards.length === 0 ? (
              <li className="text-muted-foreground col-span-full py-8 text-center text-sm">אין הזמנות פתוחות.</li>
            ) : null}
          </ul>
        </div>

        <div className="flex min-h-0 flex-[2] flex-col overflow-auto">
          <PaneHeader title="לידים להתקשר" subtitle="פניות חדשות שעוד לא דיברנו איתן" href="/dashboard/memorials/leads" linkLabel="כל הלידים" />
          {leadsToCall.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {leadsToCall.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={`/dashboard/memorials/leads/${l.id}`} className="shrink-0">
                    <Thumb imageId={leadImage.get(l.id)} alt={`הדמיה — ${l.name}`} className="size-14 rounded-md border border-border" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="min-w-0">
                      <Link href={`/dashboard/memorials/leads/${l.id}`} className="text-sm font-medium hover:underline">
                        {l.name}
                      </Link>
                      <p className="text-muted-foreground truncate text-xs">
                        {MEM_LEAD_SOURCE_LABELS[l.source as MemLeadSource] ?? l.source} · {formatDateShort(l.created_at)}
                        {l.deceased_name ? ` · ${l.deceased_name}` : ""}
                      </p>
                    </div>
                    <ContactButtons phone={l.phone} whatsappText={leadWhatsAppText(l)} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm">אין לידים שמחכים לשיחה.</p>
          )}

          <div className="border-t border-border">
            <PaneHeader title="תזכורות להתקשר" subtitle="שלושים, אזכרה ומעקב — 7 הימים הקרובים" href="/dashboard/memorials/reminders" linkLabel="כל התזכורות" />
          </div>
          {reminders.data?.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {reminders.data.map((r) => {
                const o = (Array.isArray(r.mem_orders) ? r.mem_orders[0] : r.mem_orders) as
                  | { customer_name: string; phone: string | null; deceased_name: string | null }
                  | null;
                const l = (Array.isArray(r.mem_leads) ? r.mem_leads[0] : r.mem_leads) as { name: string; phone: string | null } | null;
                const name = o?.customer_name ?? l?.name ?? "";
                const phone = o?.phone ?? l?.phone ?? null;
                const href = r.order_id ? `/dashboard/memorials/orders/${r.order_id}` : `/dashboard/memorials/leads/${r.lead_id}`;
                return (
                  <li key={r.id} className="flex flex-col gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <Link href={href} className="text-sm font-medium hover:underline">
                        {r.title}
                      </Link>
                      <p className={r.due_date < today ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>
                        {formatDateShort(r.due_date)} · {name}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ContactButtons phone={phone} whatsappText={reminderWhatsAppText(name, r.kind, o?.deceased_name ?? null)} />
                      <ReminderDoneButton id={r.id} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm">אין תזכורות לשבוע הקרוב.</p>
          )}
        </div>
      </div>
    </div>
  );
}
