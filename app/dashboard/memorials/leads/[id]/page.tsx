import Link from "next/link";
import { notFound } from "next/navigation";

import { LeadNotes, LeadStatusActions } from "@/components/memorials/lead-actions";
import { MarkReportedButton } from "@/components/memorials/mark-reported-button";
import { AddReminderForm } from "@/components/memorials/order-panels";
import { ContactButtons, Section } from "@/components/memorials/ui";
import { createClient } from "@/lib/supabase/server";
import { leadWhatsAppText } from "@/lib/memorials/contact";
import { MEM_LEAD_SELECT, memImageUrl, type MemLeadRow } from "@/lib/memorials/constants";
import { formatDateShort } from "@/lib/db/format";

import { LeadFields } from "../lead-details";

export default async function MemorialLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: lead }, { data: images }, { data: report }, { data: reminders }] = await Promise.all([
    supabase.from("mem_leads").select(MEM_LEAD_SELECT).eq("id", id).maybeSingle(),
    supabase.from("mem_images").select("id, kind, created_at").eq("lead_id", id).order("created_at"),
    supabase.from("mem_lead_reports").select("reported_at").eq("lead_id", id).eq("user_id", user?.id ?? "").maybeSingle(),
    supabase.from("mem_reminders").select("id, due_date, title, done_at").eq("lead_id", id).order("due_date"),
  ]);
  if (!lead) notFound();
  const l = lead as MemLeadRow;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-auto p-4 md:p-6">
      <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-4">
          <Section
            title={`ליד: ${l.name}`}
            actions={
              <div className="flex flex-wrap gap-2">
                {!report ? <MarkReportedButton ids={[l.id]} /> : null}
                <ContactButtons phone={l.phone} whatsappText={leadWhatsAppText(l)} />
              </div>
            }
          >
            <LeadFields lead={l} />
          </Section>
          {images?.length ? (
            <Section title="המצבה שעוצבה באתר">
              <div className="grid gap-3 sm:grid-cols-2">
                {images.map((img) => (
                  <a key={img.id} href={memImageUrl(img.id)} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-lg border border-border bg-muted/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={memImageUrl(img.id)} alt="הדמיית המצבה מהאתר" className="w-full object-contain" />
                  </a>
                ))}
              </div>
            </Section>
          ) : null}
        </div>
        <div className="flex flex-col gap-4">
          <Section title="טיפול">
            <LeadStatusActions
              leadId={l.id}
              status={l.status}
              orderId={l.order_id}
              defaultKind={l.source === "service" ? "cleaning" : "headstone"}
            />
          </Section>
          <Section title="הערות">
            <LeadNotes leadId={l.id} notes={l.notes} />
          </Section>
          <Section title="תזכורות">
            {reminders?.length ? (
              <ul className="flex flex-col gap-1 text-sm">
                {reminders.map((r) => (
                  <li key={r.id} className={r.done_at ? "text-muted-foreground line-through" : ""}>
                    {formatDateShort(r.due_date)} · {r.title}
                  </li>
                ))}
              </ul>
            ) : null}
            <AddReminderForm leadId={l.id} />
          </Section>
          <Link href="/dashboard/memorials/leads" className="text-muted-foreground text-sm hover:underline">
            חזרה לכל הלידים
          </Link>
        </div>
      </div>
    </div>
  );
}
