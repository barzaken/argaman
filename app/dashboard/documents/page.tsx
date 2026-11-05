import { KpiCard } from "@/components/kpi-card";
import { toHebrewError } from "@/lib/db/errors";
import { startOfMonthInIsraelIso } from "@/lib/db/format";
import { documentKindLabels } from "@/lib/db/labels";
import type { DocumentStatusDb, DocumentViewRow } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

import { DocumentsTable, type StatusFilter } from "./documents-table";

const LIMIT = 400;

const STATUS_ORDER: Record<DocumentStatusDb, number> = {
  pending_review: 0,
  processed: 1,
  rejected: 2,
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string }>;
}) {
  const sp = await searchParams;
  const status: StatusFilter =
    sp.status === "pending_review" || sp.status === "processed" || sp.status === "rejected"
      ? sp.status
      : "all";
  const kind = sp.kind && sp.kind in documentKindLabels ? sp.kind : "";

  const supabase = await createClient();
  const monthStart = startOfMonthInIsraelIso();

  let listQuery = supabase
    .from("documents_view")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (status !== "all") listQuery = listQuery.eq("status", status);
  if (kind) listQuery = listQuery.eq("kind", kind);

  const [
    { data: rows, error },
    { count: pendingCount },
    { count: uploadedMonth },
    { count: processedMonth },
    { count: rejectedCount },
  ] = await Promise.all([
    listQuery,
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_review"),
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .gte("created_at", monthStart),
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("status", "processed")
      .gte("reviewed_at", monthStart),
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("status", "rejected"),
  ]);

  // ממתינים לבדיקה קודם, ואז החדשים ביותר
  const list = ((rows ?? []) as DocumentViewRow[])
    .map((r, i) => ({ r, i }))
    .sort((a, b) => STATUS_ORDER[a.r.status] - STATUS_ORDER[b.r.status] || a.i - b.i)
    .map(({ r }) => r);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="grid border-b grid-cols-2 xl:grid-cols-4">
        <KpiCard label="ממתינים לבדיקה" value={pendingCount ?? 0} icon="inbox" />
        <KpiCard label="הועלו החודש" value={uploadedMonth ?? 0} icon="calendar-range" />
        <KpiCard label="טופלו החודש" value={processedMonth ?? 0} icon="clipboard-check" />
        <KpiCard label="נדחו" value={rejectedCount ?? 0} icon="file-x" />
      </div>
      <div className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
        <div className="mx-auto w-full max-w-[min(100%,80rem)]">
          {error ? (
            <p className="text-destructive text-sm">
              {toHebrewError(error, "טעינת הנתונים נכשלה. נסו לרענן את הדף.")}
            </p>
          ) : (
            <DocumentsTable
              rows={list}
              status={status}
              kind={kind}
              pendingCount={pendingCount ?? 0}
              truncatedAt={LIMIT}
            />
          )}
        </div>
      </div>
    </div>
  );
}
