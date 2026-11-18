import Link from "next/link";

import { CrmDataTable } from "@/components/crm/data-table";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { toHebrewError } from "@/lib/db/errors";
import { MEM_LEAD_STATUS_LABELS, MEM_LEAD_STATUSES, type MemLeadStatus } from "@/lib/memorials/constants";
import { cn } from "@/lib/utils";

import { leadColumnLabels, leadColumns, type LeadTableRow } from "./columns";

const LIMIT = 1000;

export default async function MemorialLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = (MEM_LEAD_STATUSES as readonly string[]).includes(status ?? "") ? (status as MemLeadStatus) : null;
  const supabase = await createClient();
  let q = supabase
    .from("mem_leads")
    .select("id, created_at, name, phone, source, status, deceased_name, utm_campaign, gclid, gbraid, wbraid, mem_images(id)")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (filter) q = q.eq("status", filter);
  else q = q.neq("status", "spam");
  const { data, error } = await q;

  const rows: LeadTableRow[] = (data ?? []).map((l) => ({
    id: l.id,
    created_at: l.created_at,
    name: l.name,
    phone: l.phone,
    source: l.source,
    status: l.status,
    deceased_name: l.deceased_name,
    utm_campaign: l.utm_campaign,
    has_image: Array.isArray(l.mem_images) && l.mem_images.length > 0,
    has_gclid: !!(l.gclid || l.gbraid || l.wbraid),
  }));

  const tabs: { key: string; label: string; href: string }[] = [
    { key: "", label: "הכל", href: "/dashboard/memorials/leads" },
    ...MEM_LEAD_STATUSES.map((s) => ({ key: s, label: MEM_LEAD_STATUS_LABELS[s], href: `/dashboard/memorials/leads?status=${s}` })),
  ];

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-auto p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[min(100%,80rem)] flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav className="flex flex-wrap gap-1.5" aria-label="סינון לפי סטטוס">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  (filter ?? "") === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/memorials/leads/unreported">לידים שלא דווחו לי</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/dashboard/memorials/leads/new">ליד טלפוני</Link>
            </Button>
          </div>
        </div>
        {error ? (
          <p className="text-destructive text-sm">{toHebrewError(error, "טעינת הלידים נכשלה")}</p>
        ) : (
          <CrmDataTable
            columns={leadColumns}
            data={rows}
            filterPlaceholder="חיפוש לפי שם, טלפון, נפטר…"
            navigateRows="memorial-lead-detail"
            columnLabels={leadColumnLabels}
            truncatedAt={LIMIT}
          />
        )}
      </div>
    </div>
  );
}
