"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { CrmDataTable } from "@/components/crm/data-table";
import { Field, OptionSelect } from "@/components/green-invoice/document-form/form-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { actionCrashed } from "@/lib/action-client";
import { formatDateShort, formatIls } from "@/lib/db/format";
import type { DocumentViewRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { GI_DOC_TYPE_LIST, giDocTypeName, type GiDocType } from "@/lib/green-invoice/document-types";

import { searchMorningDocuments, type MorningSearchItem } from "./actions";
import { morningColumnLabels, morningColumns } from "./columns";

/** מסמך המשך מוצע לכל סוג (קישור "הפקת…" מתוצאות החיפוש) */
const FOLLOW_UPS: Partial<Record<GiDocType, GiDocType[]>> = {
  10: [100, 305],
  20: [400],
  100: [200, 305],
  200: [305, 210],
  300: [305, 400],
  305: [400, 330],
  320: [330],
  405: [410],
  600: [610],
};

const TYPE_OPTIONS = [{ value: "all", label: "כל הסוגים" }, ...GI_DOC_TYPE_LIST.map((d) => ({ value: String(d.type), label: d.name }))];

function MorningSearch() {
  const [number, setNumber] = useState("");
  const [type, setType] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [clientName, setClientName] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ items: MorningSearchItem[]; total: number; pages: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(p = 1) {
    setLoading(true);
    const res = await searchMorningDocuments({
      number: number.trim() || undefined,
      types: type === "all" ? undefined : [Number(type)],
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      clientName: clientName.trim() || undefined,
      page: p,
      pageSize: 25,
    }).catch(actionCrashed);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setPage(p);
    setResult({ items: res.items, total: res.total, pages: res.pages });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="grid gap-3 rounded-lg border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[8rem_14rem_10rem_10rem_minmax(0,1fr)_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          void run(1);
        }}
      >
        <Field label="מספר מסמך">
          <Input dir="ltr" className="text-start" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
        </Field>
        <Field label="סוג מסמך">
          <OptionSelect value={type} onChange={setType} options={TYPE_OPTIONS} ariaLabel="סוג מסמך" />
        </Field>
        <Field label="מתאריך">
          <Input type="date" dir="ltr" className="text-start" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <Field label="עד תאריך">
          <Input type="date" dir="ltr" className="text-start" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </Field>
        <Field label="שם לקוח">
          <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" className="w-full gap-1.5" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
            חיפוש ב-Morning
          </Button>
        </div>
      </form>

      {result ? (
        result.items.length ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              נמצאו {result.total} מסמכים{result.pages > 1 ? ` · עמוד ${page} מתוך ${result.pages}` : ""}
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>סוג</TableHead>
                    <TableHead>מס׳</TableHead>
                    <TableHead>תאריך</TableHead>
                    <TableHead>לקוח</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead className="text-end">סכום</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>{d.typeName}</TableCell>
                      <TableCell className="tabular-nums" dir="ltr">
                        {d.number}
                      </TableCell>
                      <TableCell className="tabular-nums">{d.documentDate ? formatDateShort(d.documentDate) : "—"}</TableCell>
                      <TableCell className="max-w-48 truncate">{d.clientName ?? "—"}</TableCell>
                      <TableCell>{d.statusLabel ? <Badge variant="outline">{d.statusLabel}</Badge> : "—"}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {d.amount == null ? "—" : d.currency && d.currency !== "ILS" ? `${d.amount.toLocaleString("he-IL")} ${d.currency}` : formatIls(d.amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          {d.url ? (
                            <Button variant="outline" size="sm" asChild>
                              <a href={d.url} target="_blank" rel="noopener noreferrer">
                                PDF
                                <ExternalLink className="opacity-60" aria-hidden />
                              </a>
                            </Button>
                          ) : null}
                          {d.localDocumentId ? (
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/dashboard/documents/${d.localDocumentId}`}>בארכיון</Link>
                            </Button>
                          ) : null}
                          {(FOLLOW_UPS[d.type as GiDocType] ?? []).map((t) => (
                            <Button key={t} variant="ghost" size="sm" asChild>
                              <Link href={`/dashboard/green-invoice/documents/new?type=${t}&link=${encodeURIComponent(d.id)}`}>
                                הפקת {giDocTypeName(t)}
                              </Link>
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {result.pages > 1 ? (
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => void run(page - 1)}>
                  הקודם
                </Button>
                <Button variant="outline" size="sm" disabled={page >= result.pages || loading} onClick={() => void run(page + 1)}>
                  הבא
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">לא נמצאו מסמכים ב-Morning</p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">חיפוש לפי מספר, סוג, תאריכים או שם לקוח (POST /documents/search)</p>
      )}
    </div>
  );
}

export function MorningDocumentsView({
  rows,
  tab,
  configured,
  truncatedAt,
}: {
  rows: DocumentViewRow[];
  tab: "issued" | "morning";
  configured: boolean;
  truncatedAt: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState(tab);

  return (
    <div className="flex flex-col gap-3">
      <Tabs
        value={current}
        onValueChange={(v) => {
          setCurrent(v as "issued" | "morning");
          startTransition(() => router.replace(v === "morning" ? `${pathname}?tab=morning` : pathname));
        }}
        dir="rtl"
        className="self-start"
      >
        <TabsList aria-label="תצוגה">
          <TabsTrigger value="issued">הופקו מהמערכת ({rows.length})</TabsTrigger>
          <TabsTrigger value="morning" disabled={!configured}>
            חיפוש ב-Morning
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {current === "morning" ? (
        <MorningSearch />
      ) : (
        <div
          className={cn(
            "[&_tbody_tr:has([data-row-href])]:cursor-pointer [&_tbody_tr:has([data-row-href]):hover]:bg-muted/60",
            isPending && "opacity-60 transition-opacity"
          )}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest("a,button,input,[role=menuitem]")) return;
            const href = target.closest("tbody tr")?.querySelector<HTMLElement>("[data-row-href]")?.dataset.rowHref;
            if (href) router.push(href);
          }}
        >
          <CrmDataTable
            columns={morningColumns}
            data={rows}
            filterPlaceholder="חיפוש לפי סוג, מספר, צד שני…"
            columnLabels={morningColumnLabels}
            truncatedAt={truncatedAt}
          />
        </div>
      )}
    </div>
  );
}
