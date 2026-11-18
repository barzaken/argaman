import Link from "next/link";

import { ReminderDoneButton } from "@/components/memorials/order-panels";
import { ContactButtons } from "@/components/memorials/ui";
import { createClient } from "@/lib/supabase/server";
import { toHebrewError } from "@/lib/db/errors";
import { formatDateShort, todayIsoInIsrael } from "@/lib/db/format";
import { reminderWhatsAppText } from "@/lib/memorials/contact";
import { MEM_REMINDER_KIND_LABELS } from "@/lib/memorials/constants";

type Rem = {
  id: string;
  kind: string;
  due_date: string;
  title: string;
  order_id: string | null;
  lead_id: string | null;
  mem_orders: { customer_name: string; phone: string | null; deceased_name: string | null } | null;
  mem_leads: { name: string; phone: string | null } | null;
};

export default async function MemorialRemindersPage() {
  const supabase = await createClient();
  const today = todayIsoInIsrael();
  const { data, error } = await supabase
    .from("mem_reminders")
    .select("id, kind, due_date, title, order_id, lead_id, mem_orders(customer_name, phone, deceased_name), mem_leads(name, phone)")
    .is("done_at", null)
    .order("due_date")
    .limit(500);
  const rows = (data ?? []).map((r) => ({
    ...r,
    mem_orders: Array.isArray(r.mem_orders) ? r.mem_orders[0] ?? null : r.mem_orders,
    mem_leads: Array.isArray(r.mem_leads) ? r.mem_leads[0] ?? null : r.mem_leads,
  })) as Rem[];
  const groups: { title: string; list: Rem[] }[] = [
    { title: "באיחור / היום", list: rows.filter((r) => r.due_date <= today) },
    { title: "בקרוב", list: rows.filter((r) => r.due_date > today) },
  ];

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-auto p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          תזכורות לצוות להתקשר למשפחות: שלושים, אזכרה שנתית ותזכורות שהוספתם. (שליחה אוטומטית ללקוח — בהמשך.)
        </p>
        {error ? <p className="text-destructive text-sm">{toHebrewError(error)}</p> : null}
        {groups.map((g) => (
          <section key={g.title} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">
              {g.title} ({g.list.length})
            </h2>
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
              {g.list.map((r) => {
                const name = r.mem_orders?.customer_name ?? r.mem_leads?.name ?? "";
                const phone = r.mem_orders?.phone ?? r.mem_leads?.phone ?? null;
                const href = r.order_id ? `/dashboard/memorials/orders/${r.order_id}` : `/dashboard/memorials/leads/${r.lead_id}`;
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <Link href={href} className="font-medium hover:underline">
                        {r.title}
                      </Link>
                      <p className={r.due_date < today ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>
                        {MEM_REMINDER_KIND_LABELS[r.kind] ?? r.kind} · {formatDateShort(r.due_date)} · {name}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ContactButtons phone={phone} whatsappText={reminderWhatsAppText(name, r.kind, r.mem_orders?.deceased_name ?? null)} />
                      <ReminderDoneButton id={r.id} />
                    </div>
                  </li>
                );
              })}
              {!g.list.length ? <li className="text-muted-foreground px-3 py-2 text-sm">אין.</li> : null}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
