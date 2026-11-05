import Link from "next/link";
import { Paperclip, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDateShort, formatIls } from "@/lib/db/format";
import { documentKindLabels } from "@/lib/db/labels";
import type { DocumentKindDb, DocumentViewRow } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { DocumentStatusBadge } from "./document-badges";

export type DocumentsPanelFilter =
  | { customerId: string }
  | { supplierId: string }
  | { orderId: string }
  | { deliveryId: string }
  | { paymentId: string }
  | { expenseId: string };

const FILTER_MAP = {
  customerId: { column: "customer_id", param: "customer" },
  supplierId: { column: "supplier_id", param: "supplier" },
  orderId: { column: "order_id", param: "order" },
  deliveryId: { column: "delivery_id", param: "delivery" },
  paymentId: { column: "payment_id", param: "payment" },
  expenseId: { column: "expense_id", param: "expense" },
} as const;

const linkRowClass =
  "block rounded-lg border border-border bg-card shadow-sm transition-colors hover:bg-muted/30 hover:border-muted-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * רשימת המסמכים שמקושרים לישות (לקוח / ספק / הזמנה / משלוח / תשלום / הוצאה),
 * עם כפתור "העלאת מסמך" שממלא מראש את הקישור.
 *
 * Server Component — להטמעה בדף שרת:
 *   <DocumentsPanel filter={{ customerId: id }} />
 *   <DocumentsPanel filter={{ supplierId: id }} defaultKind="supplier_invoice" />
 */
export async function DocumentsPanel({
  filter,
  defaultKind,
  title = "מסמכים",
  limit = 30,
  className,
}: {
  filter: DocumentsPanelFilter;
  /** סוג מסמך שייבחר מראש בטופס ההעלאה */
  defaultKind?: DocumentKindDb;
  title?: string;
  limit?: number;
  className?: string;
}) {
  const key = Object.keys(filter)[0] as keyof typeof FILTER_MAP;
  const value = (filter as Record<string, string>)[key];
  const map = FILTER_MAP[key];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents_view")
    .select("*")
    .eq(map.column, value)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as DocumentViewRow[];

  const uploadParams = new URLSearchParams({ [map.param]: value });
  if (defaultKind) uploadParams.set("kind", defaultKind);
  const uploadHref = `/dashboard/documents/new?${uploadParams.toString()}`;

  return (
    <section className={cn("flex flex-col", className)} aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-muted-foreground text-xs">
            {rows.length > 0 ? `${rows.length} מסמכים מקושרים` : "צילומים וקבצים של מסמכים"}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <Link href={uploadHref}>
            <Upload className="size-3.5" aria-hidden />
            העלאת מסמך
          </Link>
        </Button>
      </div>
      <ul className="flex flex-col gap-3 p-4">
        {error ? (
          <li className="text-destructive text-sm">טעינת המסמכים נכשלה.</li>
        ) : null}
        {rows.map((d) => (
          <li key={d.id}>
            <Link href={`/dashboard/documents/${d.id}`} className={cn(linkRowClass, "px-3 py-3")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
                  {documentKindLabels[d.kind] ?? d.kind}
                  {d.document_number ? (
                    <span className="tabular-nums" dir="ltr">
                      #{d.document_number}
                    </span>
                  ) : null}
                  {d.storage_path ? (
                    <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="יש קובץ" />
                  ) : null}
                </span>
                <DocumentStatusBadge status={d.status} />
              </div>
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                {[
                  d.document_date ? formatDateShort(d.document_date) : null,
                  d.counterparty_name,
                  d.amount_total != null ? formatIls(Number(d.amount_total)) : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "ללא פרטים"}
              </p>
            </Link>
          </li>
        ))}
        {!error && rows.length === 0 ? (
          <li className="text-muted-foreground py-6 text-center text-sm">אין מסמכים מקושרים</li>
        ) : null}
      </ul>
    </section>
  );
}
