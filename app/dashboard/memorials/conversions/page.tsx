import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { formatDateShort, formatIls } from "@/lib/db/format";
import { CONVERSION_NAMES, loadConversions, sinceDaysIso } from "@/lib/memorials/conversions";

export default async function MemorialConversionsPage() {
  const supabase = await createClient();
  const since = sinceDaysIso(90);
  const rows = await loadConversions(supabase, since);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-auto p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">המרות ל-Google Ads (90 יום)</h2>
            <p className="text-muted-foreground text-sm">
              לידים מפרסומת (gclid) שדיברנו איתם — &quot;{CONVERSION_NAMES.qualified}&quot;, ושילמו מקדמה — &quot;{CONVERSION_NAMES.deposit}&quot;.
              מורידים את הקובץ ומעלים ב-Google Ads תחת Goals → Conversions → Uploads.
            </p>
          </div>
          <Button size="sm" asChild>
            <a href="/dashboard/memorials/conversions/export?days=90">
              <Download />
              הורדת CSV
            </a>
          </Button>
        </div>
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>{r.leadName}</span>
              <span className="text-muted-foreground">{r.name}</span>
              <span className="tabular-nums">{r.value !== null ? formatIls(r.value) : "—"}</span>
              <span className="text-muted-foreground tabular-nums">{formatDateShort(r.time)}</span>
            </li>
          ))}
          {!rows.length ? <li className="text-muted-foreground px-3 py-2 text-sm">אין עדיין המרות מפרסומות.</li> : null}
        </ul>
      </div>
    </div>
  );
}
