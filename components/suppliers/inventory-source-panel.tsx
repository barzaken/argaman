"use client";

import Link from "next/link";
import { FileText } from "lucide-react";

import { SupplierPicker, type SupplierOption } from "@/components/suppliers/supplier-picker";
import { Badge } from "@/components/ui/badge";
import { formatDateShort } from "@/lib/db/format";
import { documentKindLabels, documentStatusLabels } from "@/lib/db/labels";
import type { DocumentViewRow } from "@/lib/db/types";

/** כותרת מסמך המקור: "תעודת משלוח מספק #DN-7781" */
export function sourceDocumentTitle(doc: Pick<DocumentViewRow, "kind" | "document_number">) {
  return `${documentKindLabels[doc.kind]}${doc.document_number ? ` #${doc.document_number}` : ""}`;
}

/** ספק + מסמך מקור בטפסי המלאי (חדש / עריכה) */
export function InventorySourcePanel({
  suppliers,
  supplierId,
  onSupplierChange,
  sourceDocument,
  documentNotFound,
  itemsFromDocument,
  isNew,
}: {
  suppliers: SupplierOption[];
  supplierId: string | null;
  onSupplierChange: (id: string | null) => void;
  sourceDocument: DocumentViewRow | null;
  documentNotFound?: boolean;
  itemsFromDocument?: { id: string; stone_name: string; quantity_total: number }[];
  isNew: boolean;
}) {
  const doc = sourceDocument;
  return (
    <div className="flex flex-col gap-4">
      {documentNotFound ? (
        <p className="text-destructive text-sm" role="alert">
          המסמך שביקשתם (?document=) לא נמצא — הפריט יישמר בלי קישור למסמך.
        </p>
      ) : null}
      {doc ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="size-4 text-muted-foreground" aria-hidden />
            <span className="font-medium">מקור: {sourceDocumentTitle(doc)}</span>
            <Badge variant="outline" className="font-normal">
              {documentStatusLabels[doc.status]}
            </Badge>
            <Link
              href={`/dashboard/documents/${doc.id}`}
              className="ms-auto text-xs underline underline-offset-4"
              target="_blank"
            >
              פתיחת המסמך
            </Link>
          </div>
          <p className="text-muted-foreground text-xs">
            {doc.supplier_name ?? doc.counterparty_name ?? "ספק לא ידוע"} · תאריך{" "}
            {formatDateShort(doc.document_date)}
          </p>
          {isNew && doc.kind === "supplier_delivery_note" ? (
            <p className="text-muted-foreground text-xs">
              בשמירה הפריט יקושר לתעודה והתעודה תסומן ״טופל״.
            </p>
          ) : null}
          {isNew && itemsFromDocument && itemsFromDocument.length > 0 ? (
            <div className="text-xs" role="status">
              <p className="font-medium text-amber-700 dark:text-amber-400">
                כבר נקלטו מהתעודה הזו {itemsFromDocument.length} פריטים — הוסיפו רק שורות שעוד לא נקלטו:
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {itemsFromDocument.map((it) => (
                  <li key={it.id}>
                    <Link
                      href={`/dashboard/inventory/${it.id}/edit`}
                      className="underline-offset-4 hover:underline"
                    >
                      {it.stone_name} · {it.quantity_total} יח׳
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <SupplierPicker
        suppliers={suppliers}
        value={supplierId}
        onChange={onSupplierChange}
        label="ספק (לא חובה)"
        noneLabel="ללא ספק"
        compact
        newSupplierDefaults={
          doc ? { name: doc.counterparty_name, tax_id: doc.counterparty_tax_id } : undefined
        }
      />
    </div>
  );
}
