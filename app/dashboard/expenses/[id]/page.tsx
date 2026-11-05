import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { ExpenseDeleteButton } from "@/components/expenses/expense-delete-button";
import { ExpenseForm } from "@/components/expenses/expense-form";
import type { SupplierOption } from "@/components/suppliers/supplier-picker";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCrmUser } from "@/lib/supabase/auth-helpers";
import { formatDateShort, formatIlsDense } from "@/lib/db/format";
import { expenseCategoryLabels, expenseDocumentTypeLabels } from "@/lib/db/labels";
import type { DocumentViewRow, ExpenseViewRow } from "@/lib/db/types";

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("expenses_view")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();
  const expense = data as ExpenseViewRow;

  const [{ data: suppliers }, docRes, me] = await Promise.all([
    supabase.from("suppliers").select("id, name, tax_id, is_active").order("name"),
    expense.document_id
      ? supabase.from("documents_view").select("*").eq("id", expense.document_id).maybeSingle()
      : Promise.resolve({ data: null }),
    getCurrentCrmUser(),
  ]);

  const doc = (docRes.data ?? null) as DocumentViewRow | null;
  const title = `${expenseDocumentTypeLabels[expense.document_type] ?? "הוצאה"}${
    expense.document_number ? ` #${expense.document_number}` : ""
  }`;

  const header = (
    <div className="border-b border-border">
      <div className="border-b border-border px-4 py-2">
        <Link
          href="/dashboard/expenses"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowRight className="size-3.5 shrink-0 opacity-70" aria-hidden />
          כל ההוצאות
        </Link>
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-start justify-between gap-3 px-4 py-4 md:px-8">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            <Badge variant={expense.is_paid ? "secondary" : "outline"} className="font-normal">
              {expense.is_paid ? "שולם" : "לא שולם"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm tabular-nums">
            {expense.supplier_id ? (
              <Link
                href={`/dashboard/suppliers/${expense.supplier_id}`}
                className="underline-offset-4 hover:underline"
              >
                {expense.supplier_name}
              </Link>
            ) : (
              "ללא ספק"
            )}{" "}
            · {expenseCategoryLabels[expense.category]} · {formatDateShort(expense.expense_date)} ·{" "}
            {formatIlsDense(Number(expense.amount_total))}
          </p>
          <p className="text-muted-foreground text-xs">
            Green Invoice:{" "}
            {expense.green_invoice_expense_id
              ? `נשלח (מזהה ${expense.green_invoice_expense_id}${
                  expense.green_invoice_status != null
                    ? `, סטטוס ${expense.green_invoice_status}`
                    : ""
                })`
              : "לא נשלח"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* GREEN_INVOICE_EXPENSE_SLOT */}
          {me?.isAdmin ? <ExpenseDeleteButton id={expense.id} label={title} /> : null}
        </div>
      </div>
    </div>
  );

  return (
    <ExpenseForm
      key={expense.updated_at}
      suppliers={(suppliers ?? []) as SupplierOption[]}
      expense={expense}
      sourceDocument={doc}
      header={header}
    />
  );
}
