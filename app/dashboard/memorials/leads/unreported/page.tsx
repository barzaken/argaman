import Link from "next/link";

import { MarkReportedButton } from "@/components/memorials/mark-reported-button";
import { ContactButtons, Section } from "@/components/memorials/ui";
import { createClient } from "@/lib/supabase/server";
import { toHebrewError } from "@/lib/db/errors";
import { leadWhatsAppText } from "@/lib/memorials/contact";
import { MEM_LEAD_SELECT, memImageUrl, type MemLeadRow } from "@/lib/memorials/constants";

import { LeadFields } from "../lead-details";

/**
 * "לידים שלא דווחו לי" — המסך שאינסטינקט בודק בכל שעה עגולה.
 * מציג רק לידים שהמשתמש המחובר עוד לא סימן כ"דווחו" (מעקב נפרד לכל משתמש).
 */
export const dynamic = "force-dynamic";

export default async function UnreportedLeadsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mem_leads")
    .select(`${MEM_LEAD_SELECT}, mem_lead_reports(user_id), mem_images(id, kind)`)
    .neq("status", "spam")
    .order("created_at", { ascending: true })
    .limit(200);

  // RLS מחזירה ב-mem_lead_reports רק את השורות של המשתמש המחובר
  const leads = (data ?? []).filter((l) => !(Array.isArray(l.mem_lead_reports) && l.mem_lead_reports.length));
  const ids = leads.map((l) => l.id);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-auto p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold" data-testid="unreported-count">
              {leads.length ? `${leads.length} לידים חדשים שלא דווחו לך` : "אין לידים חדשים שלא דווחו לך"}
            </h2>
            <p className="text-muted-foreground text-sm">
              אחרי שמסרת את הפרטים למשתמש, לחץ &quot;סמן הכל כדווח&quot;. כל משתמש מקבל דיווח בנפרד.
            </p>
          </div>
          <MarkReportedButton ids={ids} />
        </div>
        {error ? <p className="text-destructive text-sm">{toHebrewError(error, "טעינת הלידים נכשלה")}</p> : null}
        {leads.map((raw) => {
          const lead = raw as unknown as MemLeadRow & { mem_images: { id: string; kind: string }[] | null };
          const design = (lead.mem_images ?? []).find((i) => i.kind === "design") ?? lead.mem_images?.[0];
          return (
            <Section
              key={lead.id}
              title={lead.name}
              actions={
                <div className="flex flex-wrap gap-2">
                  <ContactButtons phone={lead.phone} whatsappText={leadWhatsAppText(lead)} />
                  <MarkReportedButton ids={[lead.id]} label="סמן כדווח" />
                </div>
              }
            >
              <article data-lead-id={lead.id} className="grid gap-4 md:grid-cols-[1fr_16rem]">
                <LeadFields lead={lead} />
                <div className="flex flex-col gap-2">
                  {design ? (
                    <a href={memImageUrl(design.id)} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={memImageUrl(design.id)} alt={`הדמיית המצבה של ${lead.name}`} className="w-full rounded-lg border border-border object-contain" />
                    </a>
                  ) : (
                    <p className="text-muted-foreground text-xs">אין תמונת מצבה לליד הזה.</p>
                  )}
                  <Link href={`/dashboard/memorials/leads/${lead.id}`} className="text-primary text-sm underline underline-offset-4">
                    כרטיס הליד
                  </Link>
                </div>
              </article>
            </Section>
          );
        })}
      </div>
    </div>
  );
}
