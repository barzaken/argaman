import { ExpenseForm } from "@/components/expenses/expense-form";
import type { SupplierOption } from "@/components/suppliers/supplier-picker";
import { createClient } from "@/lib/supabase/server";
import type { DocumentViewRow } from "@/lib/db/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ document?: string; supplier?: string }>;
}) {
  const { document: documentId, supplier } = await searchParams;
  const supabase = await createClient();

  const [{ data: suppliers }, docRes] = await Promise.all([
    supabase.from("suppliers").select("id, name, tax_id, is_active").order("name"),
    documentId && UUID_RE.test(documentId)
      ? supabase.from("documents_view").select("*").eq("id", documentId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const doc = (docRes.data ?? null) as DocumentViewRow | null;

  return (
    <ExpenseForm
      suppliers={(suppliers ?? []) as SupplierOption[]}
      sourceDocument={doc}
      defaultSupplierId={supplier && UUID_RE.test(supplier) ? supplier : null}
      existingExpenseIdForDocument={doc?.expense_id ?? null}
      header={
        documentId && !doc ? (
          <p className="text-destructive border-b border-border px-4 py-3 text-sm" role="alert">
            המסמך שביקשתם (?document=) לא נמצא — ההוצאה תישמר בלי קישור למסמך.
          </p>
        ) : null
      }
    />
  );
}
