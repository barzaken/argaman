import { CrmDataTable } from "@/components/crm/data-table";
import { createClient } from "@/lib/supabase/server";
import { toHebrewError } from "@/lib/db/errors";
import { activityTableLabels } from "@/lib/db/labels";
import type { ActivityLogRow, CrmRoleDb, CrmUserRow } from "@/lib/db/types";

import {
  PARENT_KEYS,
  entityHref,
  formatDateTimeIsrael,
  summarizeChanges,
  tableLabel,
  type ActivityDisplayRow,
} from "./activity-format";
import { ActivityFilters } from "./activity-filters";
import { activityColumnLabels, activityColumns } from "./columns";

const LIMIT = 300;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 00:00 של תאריך (YYYY-MM-DD) בשעון ישראל, כ-ISO UTC (כולל שעון קיץ) */
function israelDayStartIso(date: string): string {
  const probe = new Date(`${date}T12:00:00Z`);
  const offset =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      timeZoneName: "longOffset",
    })
      .formatToParts(probe)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+02:00";
  return new Date(`${date}T00:00:00${offset}`).toISOString();
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** ערך עמודה מתוך changes (insert/delete = שורה מלאה, update = {old,new}) */
function changeValue(row: ActivityLogRow, column: string): unknown {
  const v = row.changes?.[column];
  if (row.action === "update") {
    const pair = v as { old?: unknown; new?: unknown } | undefined;
    return pair?.new ?? pair?.old;
  }
  return v;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function fetchMap(
  supabase: Supabase,
  table: string,
  cols: string,
  ids: Set<string>
): Promise<Map<string, Record<string, unknown>>> {
  if (ids.size === 0) return new Map();
  const { data } = await supabase.from(table).select(cols).in("id", [...ids]);
  return new Map(
    ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => [String(r.id), r])
  );
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; user?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const table = sp.table && Object.hasOwn(activityTableLabels, sp.table) ? sp.table : undefined;
  const user = sp.user && /^[0-9a-f-]{36}$/i.test(sp.user) ? sp.user : undefined;
  const from = sp.from && DATE_RE.test(sp.from) ? sp.from : undefined;
  const to = sp.to && DATE_RE.test(sp.to) ? sp.to : undefined;

  let q = supabase
    .from("activity_log")
    .select("*")
    .order("at", { ascending: false })
    .limit(LIMIT);
  if (table) q = q.eq("table_name", table);
  if (user) q = q.eq("user_id", user);
  if (from) q = q.gte("at", israelDayStartIso(from));
  if (to) q = q.lt("at", israelDayStartIso(nextDay(to)));

  const [{ data, error }, { data: usersData }] = await Promise.all([
    q,
    supabase.rpc("crm_list_users"),
  ]);

  const logRows = (data ?? []) as ActivityLogRow[];

  // ---- הורים של פריטים / חיובים (ב-update ה-order_id לא תמיד ב-changes)
  const parentOf = new Map<number, string | null>();
  const childLookups = new Map<string, Set<string>>();
  for (const r of logRows) {
    const key = PARENT_KEYS[r.table_name];
    if (!key) continue;
    const p = asString(changeValue(r, key));
    parentOf.set(r.id, p);
    if (!p && r.row_id) {
      if (!childLookups.has(r.table_name)) childLookups.set(r.table_name, new Set());
      childLookups.get(r.table_name)!.add(r.row_id);
    }
  }
  const childMaps = await Promise.all(
    [...childLookups.entries()].map(async ([t, ids]) => {
      const m = await fetchMap(supabase, t, `id, ${PARENT_KEYS[t]}`, ids);
      return [t, m] as const;
    })
  );
  for (const [t, m] of childMaps) {
    for (const r of logRows) {
      if (r.table_name !== t || parentOf.get(r.id) || !r.row_id) continue;
      const child = m.get(r.row_id);
      parentOf.set(r.id, child ? asString(child[PARENT_KEYS[t]]) : null);
    }
  }

  // ---- שמות / מספרים לתצוגה
  const idsByTable: Record<string, Set<string>> = {
    orders: new Set(),
    deliveries: new Set(),
    quotes: new Set(),
    customers: new Set(),
    stones: new Set(),
    suppliers: new Set(),
    payments: new Set(),
    documents: new Set(),
    inventory_items: new Set(),
  };
  const parentTableOf: Record<string, string> = {
    order_id: "orders",
    quote_id: "quotes",
    customer_id: "customers",
    delivery_id: "deliveries",
  };
  for (const r of logRows) {
    if (r.row_id && idsByTable[r.table_name]) idsByTable[r.table_name].add(r.row_id);
    const p = parentOf.get(r.id);
    const key = PARENT_KEYS[r.table_name];
    if (p && key) idsByTable[parentTableOf[key]].add(p);
    // פריט מלאי שנמחק — השם מהאבן שלו
    if (r.table_name === "inventory_items") {
      const sid = asString(changeValue(r, "stone_id"));
      if (sid) idsByTable.stones.add(sid);
    }
  }
  const [
    orders,
    deliveries,
    quotes,
    customers,
    stones,
    suppliers,
    payments,
    documents,
    inventory,
  ] = await Promise.all([
      fetchMap(supabase, "orders", "id, order_number", idsByTable.orders),
      fetchMap(supabase, "deliveries", "id, delivery_number", idsByTable.deliveries),
      fetchMap(supabase, "quotes", "id, quote_number", idsByTable.quotes),
      fetchMap(supabase, "customers", "id, name", idsByTable.customers),
      fetchMap(supabase, "stones", "id, name", idsByTable.stones),
      fetchMap(supabase, "suppliers", "id, name", idsByTable.suppliers),
      fetchMap(supabase, "payments", "id, payment_number", idsByTable.payments),
      fetchMap(supabase, "documents", "id, document_number, file_name", idsByTable.documents),
      fetchMap(supabase, "inventory_items_view", "id, stone_name", idsByTable.inventory_items),
    ]);

  function labelFor(t: string, id: string | null, r: ActivityLogRow | null): string | null {
    const fromRow = (col: string) => (r ? changeValue(r, col) : undefined);
    switch (t) {
      case "orders": {
        const n = (id && orders.get(id)?.order_number) ?? fromRow("order_number");
        return n ? `הזמנה #${n}` : null;
      }
      case "deliveries": {
        const n = (id && deliveries.get(id)?.delivery_number) ?? fromRow("delivery_number");
        return n ? `משלוח #${n}` : null;
      }
      case "quotes": {
        const n = (id && quotes.get(id)?.quote_number) ?? fromRow("quote_number");
        return n ? `הצעה #${n}` : null;
      }
      case "payments": {
        const n = (id && payments.get(id)?.payment_number) ?? fromRow("payment_number");
        return n ? `תשלום #${n}` : null;
      }
      case "customers":
        return asString((id && customers.get(id)?.name) ?? fromRow("name"));
      case "stones":
        return asString((id && stones.get(id)?.name) ?? fromRow("name"));
      case "suppliers":
        return asString((id && suppliers.get(id)?.name) ?? fromRow("name"));
      case "documents": {
        const doc = id ? documents.get(id) : undefined;
        const n =
          asString(doc?.document_number) ??
          asString(fromRow("document_number")) ??
          asString(doc?.file_name) ??
          asString(fromRow("file_name"));
        return n ? `מסמך ${n}` : null;
      }
      case "inventory_items": {
        const name =
          asString(id ? inventory.get(id)?.stone_name : undefined) ??
          asString(stones.get(asString(fromRow("stone_id")) ?? "")?.name);
        return name ? `מלאי: ${name}` : null;
      }
      case "expenses":
        return asString(fromRow("description")) ?? asString(fromRow("document_number"));
      default:
        return null;
    }
  }

  const existsIn: Record<string, Map<string, unknown>> = {
    orders,
    deliveries,
    quotes,
    customers,
    stones,
    suppliers,
    payments,
    documents,
    inventory_items: inventory,
  };

  const rows: ActivityDisplayRow[] = logRows.map((r) => {
    const parentKey = PARENT_KEYS[r.table_name];
    const parentId = parentOf.get(r.id) ?? null;
    let entity: string | null;
    if (parentKey) {
      const parentLabel = labelFor(parentTableOf[parentKey], parentId, null);
      const own =
        r.table_name === "order_charges"
          ? asString(changeValue(r, "description"))
          : null;
      entity = [parentLabel, own].filter(Boolean).join(" · ") || null;
    } else {
      entity = labelFor(r.table_name, r.row_id, r);
    }
    const exists =
      r.action !== "delete" &&
      (existsIn[r.table_name] ? !!(r.row_id && existsIn[r.table_name].has(r.row_id)) : true);
    return {
      id: String(r.id),
      at: r.at,
      at_display: formatDateTimeIsrael(r.at),
      user_email: r.user_email,
      user_role: (r.user_role as CrmRoleDb | null) ?? null,
      action: r.action,
      table_name: r.table_name,
      table_label: tableLabel(r.table_name),
      entity_label: entity ?? (r.row_id ? `…${r.row_id.slice(-6)}` : "—"),
      href: entityHref(r.table_name, r.row_id, parentId, exists),
      changes: summarizeChanges(r),
    };
  });

  // משתמשים לסינון: רשימת המשתמשים + מי שמופיע ביומן
  const userOptions = new Map<string, string>();
  for (const u of (usersData ?? []) as CrmUserRow[]) {
    userOptions.set(u.user_id, u.email ?? u.display_name ?? u.user_id);
  }
  for (const r of logRows) {
    if (r.user_id && !userOptions.has(r.user_id)) {
      userOptions.set(r.user_id, r.user_email ?? r.user_id);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
        <div className="mx-auto flex w-full max-w-[min(100%,80rem)] flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">יומן פעולות</h2>
            <p className="text-muted-foreground text-sm">
              כל יצירה, עדכון ומחיקה במערכת — מי, מתי ומה השתנה. מוצגות{" "}
              {LIMIT} הפעולות האחרונות לפי הסינון.
            </p>
          </div>
          <ActivityFilters
            table={table ?? null}
            user={user ?? null}
            from={from ?? ""}
            to={to ?? ""}
            users={[...userOptions.entries()].map(([value, label]) => ({ value, label }))}
          />
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {toHebrewError(error, "טעינת יומן הפעולות נכשלה")}
            </p>
          ) : (
            <CrmDataTable
              key={`${table ?? ""}|${user ?? ""}|${from ?? ""}|${to ?? ""}`}
              columns={activityColumns}
              data={rows}
              filterPlaceholder="חיפוש ברשומה, במשתמש או בשינוי…"
              columnLabels={activityColumnLabels}
              truncatedAt={LIMIT}
            />
          )}
        </div>
      </div>
    </div>
  );
}
