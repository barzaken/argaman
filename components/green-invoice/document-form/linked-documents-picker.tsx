"use client";

import { useState } from "react";
import { ExternalLink, Link2, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { actionCrashed } from "@/lib/action-client";
import { formatDateShort } from "@/lib/db/format";
import {
  GI_DOC_TYPE_DEFS,
  GI_LINK_TYPE_LABELS,
  giDocTypeName,
  suggestedLinkType,
  type GiDocType,
  type GiLinkType,
} from "@/lib/green-invoice/document-types";
import { searchDocumentsForLink, type LinkableDocument } from "@/app/dashboard/documents/links-actions";
import { searchMorningDocuments, type MorningSearchItem } from "@/app/dashboard/green-invoice/documents/actions";
import type { LinkedPick } from "@/app/dashboard/green-invoice/documents/prefill";

import { Field, OptionSelect, formatMoney } from "./form-bits";

type Result = {
  greenInvoiceId: string;
  label: string;
  type: number | null;
  date: string | null;
  counterparty: string | null;
  amount: number | null;
  currency: string;
  localDocumentId: string | null;
  url: string | null;
  status?: string | null;
};

function fromLocal(d: LinkableDocument): Result {
  return {
    greenInvoiceId: d.green_invoice_id!,
    label: d.label,
    type: d.green_invoice_type,
    date: d.document_date,
    counterparty: d.counterparty_name,
    amount: d.amount_total,
    currency: d.currency,
    localDocumentId: d.id,
    url: d.green_invoice_url,
  };
}

function fromMorning(d: MorningSearchItem): Result {
  return {
    greenInvoiceId: d.id,
    label: `${d.typeName} ${d.number}`,
    type: d.type,
    date: d.documentDate,
    counterparty: d.clientName,
    amount: d.amount,
    currency: d.currency ?? "ILS",
    localDocumentId: d.localDocumentId,
    url: d.url,
    status: d.statusLabel,
  };
}

/**
 * בחירת מסמכים מקושרים (linkedDocumentIds + linkType): חיפוש בארכיון שלנו (מסמכים שהופקו ב-Morning)
 * או ישירות ב-Morning (POST /documents/search).
 */
export function LinkedDocumentsPicker({
  type,
  linked,
  onLinkedChange,
  linkType,
  onLinkTypeChange,
  customerId,
  configured,
  errors,
}: {
  type: GiDocType;
  linked: LinkedPick[];
  onLinkedChange: (l: LinkedPick[]) => void;
  linkType: GiLinkType | "";
  onLinkTypeChange: (t: GiLinkType) => void;
  customerId: string | null;
  configured: boolean;
  errors: Record<string, string>;
}) {
  const def = GI_DOC_TYPE_DEFS[type];
  const [source, setSource] = useState<"local" | "morning">("local");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const typical = def.typicalLinks.map((l) => l.to);

  async function search() {
    setLoading(true);
    try {
      if (source === "local") {
        const res = await searchDocumentsForLink({
          query,
          greenInvoiceOnly: true,
          customerId: query ? undefined : (customerId ?? undefined),
          limit: 25,
        }).catch(actionCrashed);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        setResults(res.items.map(fromLocal));
      } else {
        const q = query.trim();
        const res = await searchMorningDocuments({
          number: /^\d+$/.test(q) ? q : undefined,
          clientName: q && !/^\d+$/.test(q) ? q : undefined,
          types: typical.length ? typical : undefined,
          pageSize: 25,
        }).catch(actionCrashed);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        setResults(res.items.map(fromMorning));
      }
    } finally {
      setLoading(false);
    }
  }

  function add(r: Result) {
    if (linked.some((l) => l.greenInvoiceId === r.greenInvoiceId)) return;
    const next = [...linked, { greenInvoiceId: r.greenInvoiceId, label: r.label, type: r.type, localDocumentId: r.localDocumentId, url: r.url }];
    onLinkedChange(next);
    if (!linkType || linked.length === 0) onLinkTypeChange(suggestedLinkType(type, r.type));
  }

  const sorted = results
    ? [...results].sort((a, b) => Number(typical.includes((b.type ?? 0) as GiDocType)) - Number(typical.includes((a.type ?? 0) as GiDocType)))
    : null;

  return (
    <div className="flex flex-col gap-3">
      {def.typicalLinks.length ? (
        <p className="text-xs text-muted-foreground">
          {def.name} מקושרת בדרך כלל ל: {def.typicalLinks.map((l) => `${giDocTypeName(l.to)}${l.linkType === "cancel" ? " (ביטול)" : ""}`).join(" · ")}
        </p>
      ) : null}

      {linked.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="מסמכים מקושרים">
          {linked.map((l) => (
            <li key={l.greenInvoiceId} className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-sm shadow-sm">
              <Link2 className="size-3.5 text-muted-foreground" aria-hidden />
              {l.localDocumentId ? (
                <a href={`/dashboard/documents/${l.localDocumentId}`} className="hover:underline" target="_blank" rel="noopener noreferrer">
                  {l.label}
                </a>
              ) : (
                <span>{l.label}</span>
              )}
              {l.url ? (
                <a href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`PDF של ${l.label}`} className="text-muted-foreground hover:text-foreground">
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs"
                onClick={() => onLinkedChange(linked.filter((x) => x.greenInvoiceId !== l.greenInvoiceId))}
                aria-label={`הסרת קישור ל${l.label}`}
              >
                <X className="size-3" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">לא נבחרו מסמכים מקושרים</p>
      )}

      {linked.length ? (
        <Field label="סוג הקישור" error={errors.linkType} className="max-w-xs">
          <OptionSelect
            value={linkType || def.defaultLinkType}
            onChange={(v) => onLinkTypeChange(v as GiLinkType)}
            options={def.linkTypes.map((t) => ({ value: t, label: GI_LINK_TYPE_LABELS[t] }))}
            ariaLabel="סוג הקישור"
          />
        </Field>
      ) : null}

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Tabs value={source} onValueChange={(v) => { setSource(v as "local" | "morning"); setResults(null); }} dir="rtl">
            <TabsList aria-label="מקור החיפוש">
              <TabsTrigger value="local">בארכיון המסמכים</TabsTrigger>
              <TabsTrigger value="morning" disabled={!configured}>
                ב-Morning
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Field label="חיפוש מסמך לקישור" className="min-w-48 flex-1">
            <Input
              value={query}
              placeholder="מספר מסמך או שם לקוח"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void search();
                }
              }}
            />
          </Field>
          <Button type="button" variant="outline" className="gap-1" onClick={() => void search()} disabled={loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Search className="size-3.5" aria-hidden />}
            חיפוש
          </Button>
        </div>
        {sorted ? (
          sorted.length ? (
            <ul className="flex max-h-64 flex-col divide-y overflow-y-auto rounded-md border" aria-label="תוצאות חיפוש מסמכים">
              {sorted.map((r) => {
                const chosen = linked.some((l) => l.greenInvoiceId === r.greenInvoiceId);
                return (
                  <li key={r.greenInvoiceId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {r.label}
                        {typical.includes((r.type ?? 0) as GiDocType) ? (
                          <span className="ms-2 text-xs font-normal text-emerald-700 dark:text-emerald-400">מתאים</span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[r.counterparty, r.date ? formatDateShort(r.date) : null, r.amount != null ? formatMoney(r.amount, r.currency) : null, r.status]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Button type="button" size="sm" variant={chosen ? "ghost" : "outline"} disabled={chosen} className="shrink-0 gap-1" onClick={() => add(r)} aria-label={`קישור ל${r.label}`}>
                      <Plus className="size-3.5" aria-hidden />
                      {chosen ? "נבחר" : "קישור"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">לא נמצאו מסמכים</p>
          )
        ) : null}
      </div>
    </div>
  );
}
