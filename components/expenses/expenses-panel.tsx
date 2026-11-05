import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { toHebrewError } from "@/lib/db/errors";
import { formatDateShort, formatIls } from "@/lib/db/format";
import { expenseCategoryLabels, expenseDocumentTypeLabels } from "@/lib/db/labels";
import type { ExpenseViewRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";

const linkRowClass =
  "block rounded-lg border border-border bg-card shadow-sm transition-colors hover:bg-muted/30 hover:border-muted-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * רשימת הוצאות של ספק — להטמעה בדפים אחרים (Server Component):
 * `<ExpensesPanel supplierId={id} />`
 */
export async function ExpensesPanel({
  supplierId,
  limit = 50,
  title = "הוצאות",
  showNewButton = true,
}: {
  supplierId: string;
  limit?: number;
  title?: string;
  showNewButton?: boolean;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses_view")
    .select("*")
    .eq("supplier_id", supplierId)
    .order("expense_date", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as ExpenseViewRow[];

  return (
    <section className="flex flex-col" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-muted-foreground text-xs">
            {rows.length >= limit ? `${limit} האחרונות` : `${rows.length} הוצאות`}
          </p>
        </div>
        {showNewButton ? (
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link href={`/dashboard/expenses/new?supplier=${supplierId}`}>
              <Plus className="size-3.5" aria-hidden />
              הוצאה חדשה לספק
            </Link>
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="text-destructive p-4 text-sm">
          {toHebrewError(error, "טעינת ההוצאות נכשלה.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3 p-4">
          {rows.map((e) => (
            <li key={e.id}>
              <Link href={`/dashboard/expenses/${e.id}`} className={cn(linkRowClass, "px-3 py-3")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {expenseDocumentTypeLabels[e.document_type] ?? "מסמך"}
                    {e.document_number ? ` #${e.document_number}` : ""}
                  </span>
                  <Badge
                    variant={e.is_paid ? "secondary" : "outline"}
                    className="font-normal"
                  >
                    {e.is_paid ? "שולם" : "לא שולם"}
                  </Badge>
                </div>
                <div className="text-muted-foreground mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>
                    {formatDateShort(e.expense_date)} · {expenseCategoryLabels[e.category]}
                    {e.description ? ` · ${e.description}` : ""}
                  </span>
                  <span className="font-medium text-foreground tabular-nums">
                    {formatIls(Number(e.amount_total))}
                  </span>
                </div>
              </Link>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="text-muted-foreground py-8 text-center text-sm">
              אין הוצאות לספק זה
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
