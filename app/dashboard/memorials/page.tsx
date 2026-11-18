import Link from "next/link";

import { KpiCard } from "@/components/kpi-card";
import { Button } from "@/components/ui/button";
import { ContactButtons, Section, StageBadge } from "@/components/memorials/ui";
import { ReminderDoneButton } from "@/components/memorials/order-panels";
import { createClient } from "@/lib/supabase/server";
import { formatDateShort, startOfMonthInIsraelIso, todayIsoInIsrael } from "@/lib/db/format";
import { toHebrewError } from "@/lib/db/errors";
import { leadWhatsAppText, reminderWhatsAppText } from "@/lib/memorials/contact";
import {
  MEM_LEAD_SOURCE_LABELS,
  MEM_ORDER_KIND_LABELS,
  MEM_PIPELINE_STAGES,
  MEM_STAGE_LABELS,
  type MemLeadSource,
  type MemOrderKind,
  type MemStage,
} from "@/lib/memorials/constants";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function MemorialsHomePage() {
  const supabase = await createClient();
  const today = todayIsoInIsrael();
  const [newLeads, monthLeads, orders, reminders] = await Promise.all([
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
      .select("id, number, stage, kind, customer_name, deceased_name, installation_date")
      .not("stage", "in", "(done,cancelled)")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("mem_reminders")
      .select("id, kind, due_date, title, order_id, lead_id, mem_orders(customer_name, phone, deceased_name), mem_leads(name, phone)")
      .is("done_at", null)
      .lte("due_date", addDays(today, 7))
      .order("due_date")
      .limit(50),
  ]);

  const err = newLeads.error ?? orders.error ?? reminders.error;
  const openOrders = orders.data ?? [];
  const byStage = new Map<MemStage, number>();
  for (const o of openOrders) byStage.set(o.stage as MemStage, (byStage.get(o.stage as MemStage) ?? 0) + 1);
  const upcomingInstalls = openOrders
    .filter((o) => o.installation_date && o.installation_date >= today)
    .sort((a, b) => (a.installation_date! < b.installation_date! ? -1 : 1))
    .slice(0, 8);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-auto">
      <div className="grid grid-cols-2 border-b xl:grid-cols-4">
        <KpiCard label="לידים חדשים — להתקשר" value={newLeads.data?.length ?? 0} icon="inbox" />
        <KpiCard label="לידים החודש" value={monthLeads.count ?? 0} icon="users" />
        <KpiCard label="הזמנות פתוחות" value={openOrders.length} icon="clipboard-check" />
        <KpiCard label="תזכורות לשבוע הקרוב" value={reminders.data?.length ?? 0} icon="calendar" />
      </div>
      <div className="mx-auto grid w-full max-w-[min(100%,80rem)] gap-4 p-4 md:p-6 lg:grid-cols-2">
        {err ? <p className="text-destructive text-sm lg:col-span-2">{toHebrewError(err, "טעינת הנתונים נכשלה")}</p> : null}

        <Section
          title="לידים חדשים — להתקשר עכשיו"
          actions={
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/memorials/leads">כל הלידים</Link>
            </Button>
          }
        >
          {newLeads.data?.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {newLeads.data.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <Link href={`/dashboard/memorials/leads/${l.id}`} className="font-medium hover:underline">
                      {l.name}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {MEM_LEAD_SOURCE_LABELS[l.source as MemLeadSource] ?? l.source} · {formatDateShort(l.created_at)}
                      {l.deceased_name ? ` · ${l.deceased_name}` : ""}
                    </p>
                  </div>
                  <ContactButtons phone={l.phone} whatsappText={leadWhatsAppText(l)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">אין לידים שמחכים לשיחה.</p>
          )}
        </Section>

        <Section
          title="תזכורות להתקשר"
          actions={
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/memorials/reminders">כל התזכורות</Link>
            </Button>
          }
        >
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
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <Link href={href} className="font-medium hover:underline">
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
            <p className="text-muted-foreground text-sm">אין תזכורות לשבוע הקרוב.</p>
          )}
        </Section>

        <Section
          title="הזמנות פתוחות לפי שלב"
          actions={
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/memorials/orders">לוח הזמנות</Link>
            </Button>
          }
        >
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MEM_PIPELINE_STAGES.map((s) => (
              <li key={s} className="rounded-lg border border-border p-2">
                <p className="text-muted-foreground text-xs">{MEM_STAGE_LABELS[s]}</p>
                <p className="text-lg font-semibold tabular-nums">{byStage.get(s) ?? 0}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="התקנות קרובות">
          {upcomingInstalls.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {upcomingInstalls.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/dashboard/memorials/orders/${o.id}`} className="hover:underline">
                    #{o.number} · {o.customer_name}
                    {o.deceased_name ? ` (${o.deceased_name})` : ""} · {MEM_ORDER_KIND_LABELS[o.kind as MemOrderKind]}
                  </Link>
                  <span className="flex items-center gap-2">
                    <StageBadge stage={o.stage as MemStage} />
                    <span className="tabular-nums">{formatDateShort(o.installation_date)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">אין התקנות מתוכננות.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
