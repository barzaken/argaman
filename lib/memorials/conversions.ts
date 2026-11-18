import "server-only";

import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const CONVERSION_NAMES = {
  qualified: process.env.MEM_ADS_CONVERSION_QUALIFIED?.trim() || "Memorial - Qualified lead",
  deposit: process.env.MEM_ADS_CONVERSION_DEPOSIT?.trim() || "Memorial - Deposit",
};

export type ConversionRow = {
  gclid: string;
  name: string;
  time: string; // ISO
  value: number | null;
  leadName: string;
};

export function sinceDaysIso(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

/** המרות אופליין ל-Google Ads: ליד שדיברנו איתו (Qualified) + מקדמה ראשונה (Deposit) */
export async function loadConversions(supabase: Supabase, sinceIso: string): Promise<ConversionRow[]> {
  const { data: leads } = await supabase
    .from("mem_leads")
    .select("id, name, gclid, status, first_contact_at, order_id, created_at")
    .not("gclid", "is", null)
    .gte("created_at", sinceIso)
    .limit(5000);
  const out: ConversionRow[] = [];
  const orderIds: string[] = [];
  for (const l of leads ?? []) {
    if (!l.gclid) continue;
    if ((l.status === "contacted" || l.status === "converted") && l.first_contact_at) {
      out.push({ gclid: l.gclid, name: CONVERSION_NAMES.qualified, time: l.first_contact_at, value: null, leadName: l.name });
    }
    if (l.order_id) orderIds.push(l.order_id);
  }
  if (orderIds.length) {
    const { data: pays } = await supabase
      .from("mem_payments")
      .select("order_id, amount, paid_at, created_at, is_deposit")
      .in("order_id", orderIds)
      .order("created_at");
    const firstByOrder = new Map<string, { amount: number; created_at: string }>();
    for (const p of pays ?? []) {
      if (!firstByOrder.has(p.order_id)) firstByOrder.set(p.order_id, { amount: Number(p.amount), created_at: p.created_at });
    }
    for (const l of leads ?? []) {
      const p = l.order_id ? firstByOrder.get(l.order_id) : undefined;
      if (l.gclid && p) out.push({ gclid: l.gclid, name: CONVERSION_NAMES.deposit, time: p.created_at, value: p.amount, leadName: l.name });
    }
  }
  return out.sort((a, b) => (a.time < b.time ? -1 : 1));
}

function israelDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}:${g("second")}`;
}

/** תבנית ההעלאה של Google Ads (Conversions → Uploads) */
export function conversionsCsv(rows: ConversionRow[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [
    "Parameters:TimeZone=Asia/Jerusalem",
    "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency",
    ...rows.map((r) =>
      [esc(r.gclid), esc(r.name), israelDateTime(r.time), r.value !== null ? r.value.toFixed(2) : "", r.value !== null ? "ILS" : ""].join(",")
    ),
  ];
  return lines.join("\n") + "\n";
}
