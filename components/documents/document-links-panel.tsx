"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Link2, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { actionCrashed } from "@/lib/action-client";
import { formatDateShort, formatIlsDense } from "@/lib/db/format";
import { documentKindLabels, documentKindOptions } from "@/lib/db/labels";
import {
  documentLinkTypeLabels,
  documentLinkTypeOptions,
  documentLinkTypeReverseLabels,
  type DocumentLinkTypeDb,
  type DocumentLinkViewRow,
} from "@/lib/db/types-document-links";
import { giDocTypeName } from "@/lib/green-invoice/document-types";
import {
  addDocumentLink,
  listDocumentLinks,
  removeDocumentLink,
  searchDocumentsForLink,
  type LinkableDocument,
} from "@/app/dashboard/documents/links-actions";

type Side = {
  linkId: string;
  documentId: string;
  label: string;
  relation: string;
  date: string | null;
  counterparty: string | null;
  amount: number | null;
  currency: string;
  url: string | null;
  note: string | null;
};

function sideLabel(kind: string, number: string | null, giType: number | null) {
  const k = giType ? giDocTypeName(giType) : (documentKindLabels[kind as keyof typeof documentKindLabels] ?? "מסמך");
  return number ? `${k} ${number}` : k;
}

function toSides(outgoing: DocumentLinkViewRow[], incoming: DocumentLinkViewRow[]): Side[] {
  return [
    ...outgoing.map((l) => ({
      linkId: l.id,
      documentId: l.to_document_id,
      label: sideLabel(l.to_kind, l.to_document_number, l.to_green_invoice_type),
      relation: documentLinkTypeLabels[l.link_type] ?? l.link_type,
      date: l.to_document_date,
      counterparty: l.to_counterparty_name,
      amount: l.to_amount_total,
      currency: l.to_currency,
      url: l.to_green_invoice_url,
      note: l.note,
    })),
    ...incoming.map((l) => ({
      linkId: l.id,
      documentId: l.from_document_id,
      label: sideLabel(l.from_kind, l.from_document_number, l.from_green_invoice_type),
      relation: documentLinkTypeReverseLabels[l.link_type] ?? l.link_type,
      date: l.from_document_date,
      counterparty: l.from_counterparty_name,
      amount: l.from_amount_total,
      currency: l.from_currency,
      url: l.from_green_invoice_url,
      note: l.note,
    })),
  ];
}

const money = (n: number | null, currency: string) =>
  n == null ? null : currency === "ILS" ? formatIlsDense(Number(n)) : `${Number(n).toLocaleString("he-IL")} ${currency}`;

/**
 * מסמכים מקושרים (בשני הכיוונים) בדף מסמך + "קישור למסמך".
 * הטמעה: <DocumentLinksPanel documentId={d.id} isAdmin={!!me?.isAdmin} customerId={d.customer_id} />
 */
export function DocumentLinksPanel({
  documentId,
  isAdmin,
  customerId = null,
}: {
  documentId: string;
  isAdmin: boolean;
  customerId?: string | null;
}) {
  const [sides, setSides] = useState<Side[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removing, setRemoving] = useState<Side | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listDocumentLinks(documentId).catch(actionCrashed);
      if (!alive) return;
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setError(null);
      setSides(toSides(res.outgoing, res.incoming));
    })();
    return () => {
      alive = false;
    };
  }, [documentId, reloadKey]);

  return (
    <section className="flex flex-col gap-3" aria-label="מסמכים מקושרים">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">מסמכים מקושרים</h2>
          <p className="text-xs text-muted-foreground">קבלה ↔ חשבונית, חשבונית ↔ הזמנה / תעודת משלוח, זיכוי ↔ חשבונית</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setPickerOpen(true)}>
          <Link2 className="size-3.5" aria-hidden />
          קישור למסמך
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {sides === null && !error ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          טוען…
        </p>
      ) : sides && sides.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">אין מסמכים מקושרים</p>
      ) : sides ? (
        <ul className="flex flex-col divide-y rounded-lg border border-border bg-card shadow-sm">
          {sides.map((s) => (
            <li key={s.linkId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{s.relation}</Badge>
                  <Link href={`/dashboard/documents/${s.documentId}`} className="font-medium hover:underline">
                    {s.label}
                  </Link>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[s.counterparty, s.date ? formatDateShort(s.date) : null, money(s.amount, s.currency), s.note].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {s.url ? (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={`PDF של ${s.label}`}>
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  </Button>
                ) : null}
                {isAdmin ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setRemoving(s)}
                    aria-label={`הסרת הקישור ל${s.label}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <LinkPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        documentId={documentId}
        customerId={customerId}
        onLinked={reload}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="להסיר את הקישור?"
        description={removing ? `הקישור ל${removing.label} יוסר. המסמכים עצמם לא נמחקים.` : ""}
        confirmLabel="הסרת הקישור"
        confirmVariant="destructive"
        onConfirm={async () => {
          if (!removing) return;
          const res = await removeDocumentLink(removing.linkId).catch(actionCrashed);
          if (!res.ok) {
            toast.error(res.message);
            return false;
          }
          toast.success("הקישור הוסר");
          reload();
        }}
      />
    </section>
  );
}

function LinkPickerDialog({
  open,
  onOpenChange,
  documentId,
  customerId,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  documentId: string;
  customerId: string | null;
  onLinked: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [linkType, setLinkType] = useState<DocumentLinkTypeDb>("related");
  const [direction, setDirection] = useState<"to" | "from">("to");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<LinkableDocument[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  async function search() {
    setLoading(true);
    const res = await searchDocumentsForLink({
      query,
      kind: kind === "all" ? undefined : kind,
      excludeId: documentId,
      customerId: !query && customerId ? customerId : undefined,
      limit: 30,
    }).catch(actionCrashed);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setItems(res.items);
  }

  // חיפוש ראשוני כשהדיאלוג נפתח: המסמכים האחרונים (של אותו לקוח כשידוע)
  useEffect(() => {
    if (!open || items !== null) return;
    let alive = true;
    void (async () => {
      const res = await searchDocumentsForLink({
        query: "",
        excludeId: documentId,
        customerId: customerId ?? undefined,
        limit: 30,
      }).catch(actionCrashed);
      if (alive && res.ok) setItems(res.items);
    })();
    return () => {
      alive = false;
    };
  }, [open, items, documentId, customerId]);

  async function link(d: LinkableDocument) {
    setSaving(d.id);
    const res = await addDocumentLink({
      fromDocumentId: direction === "to" ? documentId : d.id,
      toDocumentId: direction === "to" ? d.id : documentId,
      linkType,
      note: note.trim() || null,
    }).catch(actionCrashed);
    setSaving(null);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(`קושר ל${d.label}`);
    onLinked();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>קישור למסמך</DialogTitle>
          <DialogDescription>חיפוש לפי מספר מסמך, סוג או שם הצד השני</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">חיפוש מסמך</span>
            <Input
              value={query}
              placeholder="מספר או שם"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void search();
                }
              }}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">סוג מסמך</span>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-full" aria-label="סוג מסמך">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">כל הסוגים</SelectItem>
                {documentKindOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="flex items-end">
            <Button type="button" variant="outline" className="gap-1" onClick={() => void search()} disabled={loading}>
              {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Search className="size-3.5" aria-hidden />}
              חיפוש
            </Button>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">סוג הקישור</span>
            <Select value={linkType} onValueChange={(v) => setLinkType(v as DocumentLinkTypeDb)}>
              <SelectTrigger className="w-full" aria-label="סוג הקישור">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {documentLinkTypeOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">כיוון</span>
            <Select value={direction} onValueChange={(v) => setDirection(v as "to" | "from")}>
              <SelectTrigger className="w-full" aria-label="כיוון הקישור">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="to">המסמך הזה מתייחס למסמך שנבחר</SelectItem>
                <SelectItem value="from">המסמך שנבחר מתייחס למסמך הזה</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">הערה</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        {items ? (
          items.length ? (
            <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-md border" aria-label="תוצאות">
              {items.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[d.counterparty_name, d.document_date ? formatDateShort(d.document_date) : null, money(d.amount_total, d.currency)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1"
                    disabled={saving !== null}
                    onClick={() => void link(d)}
                    aria-label={`קישור ל${d.label}`}
                  >
                    {saving === d.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
                    קישור
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">לא נמצאו מסמכים</p>
          )
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            סגירה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
