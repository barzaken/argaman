import { InfoRow } from "@/components/memorials/ui";
import { formatDateShort } from "@/lib/db/format";
import {
  MEM_LEAD_SOURCE_LABELS,
  MEM_LEAD_STATUS_LABELS,
  type MemLeadRow,
} from "@/lib/memorials/constants";

export function formatDateTimeIL(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(iso));
}

/** כל שדות הליד — גם למסך הליד וגם לרשימת "לא דווחו" של אינסטינקט */
export function LeadFields({ lead }: { lead: MemLeadRow }) {
  const ads = [lead.utm_source, lead.utm_medium, lead.utm_campaign, lead.utm_term, lead.utm_content].filter(Boolean).join(" / ");
  const click = lead.gclid ? "gclid" : lead.gbraid ? "gbraid" : lead.wbraid ? "wbraid" : null;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <InfoRow label="שם" value={lead.name} />
      <InfoRow label="טלפון" value={lead.phone} ltr />
      <InfoRow label="דוא״ל" value={lead.email} ltr />
      <InfoRow label="התקבל" value={formatDateTimeIL(lead.created_at)} />
      <InfoRow label="מקור" value={MEM_LEAD_SOURCE_LABELS[lead.source] ?? lead.source} />
      <InfoRow label="סטטוס" value={MEM_LEAD_STATUS_LABELS[lead.status]} />
      <InfoRow label="שם הנפטר/ת" value={lead.deceased_name} />
      <InfoRow label="תאריך פטירה" value={lead.death_date ? formatDateShort(lead.death_date) : null} />
      <div className="sm:col-span-2">
        <InfoRow label="הודעה" value={lead.message ? <span className="whitespace-pre-wrap">{lead.message}</span> : null} />
      </div>
      {lead.summary ? (
        <div className="sm:col-span-2">
          <InfoRow label="פרטי העיצוב" value={<span className="whitespace-pre-wrap">{lead.summary}</span>} />
        </div>
      ) : null}
      {lead.design_url ? (
        <div className="sm:col-span-2">
          <InfoRow
            label="קישור לעיצוב באתר"
            value={
              <a href={lead.design_url} target="_blank" rel="noopener noreferrer" className="text-primary break-all underline underline-offset-4">
                פתיחת העיצוב באתר
              </a>
            }
          />
        </div>
      ) : null}
      <InfoRow label="דף באתר" value={lead.page_url} ltr />
      <InfoRow label="קמפיין / מקור תנועה" value={ads || (click ? `Google Ads (${click})` : lead.referrer)} ltr />
      <InfoRow label="הסכמה לדיוור" value={lead.marketing_consent ? "כן" : "לא"} />
    </dl>
  );
}
