import { NewInventoryForm } from "./new-inventory-form";
import type { SupplierOption } from "@/components/suppliers/supplier-picker";
import { createClient } from "@/lib/supabase/server";
import type { DocumentViewRow, StoneRow } from "@/lib/db/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ document?: string; supplier?: string }>;
}) {
  const { document: documentParam, supplier } = await searchParams;
  const documentId = documentParam && UUID_RE.test(documentParam) ? documentParam : null;
  const supabase = await createClient();

  const [{ data: stones }, { data: suppliers }, docRes, fromDocRes] = await Promise.all([
    supabase.from("stones").select("*").eq("is_active", true).order("name"),
    supabase.from("suppliers").select("id, name, tax_id, is_active").order("name"),
    documentId
      ? supabase.from("documents_view").select("*").eq("id", documentId).maybeSingle()
      : Promise.resolve({ data: null }),
    documentId
      ? supabase
          .from("inventory_items_view")
          .select("id, stone_name, quantity_total")
          .eq("source_document_id", documentId)
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <NewInventoryForm
      stones={(stones ?? []) as StoneRow[]}
      suppliers={(suppliers ?? []) as SupplierOption[]}
      sourceDocument={(docRes.data ?? null) as DocumentViewRow | null}
      documentNotFound={Boolean(documentParam) && !docRes.data}
      itemsFromDocument={
        (fromDocRes.data ?? []) as { id: string; stone_name: string; quantity_total: number }[]
      }
      defaultSupplierId={supplier && UUID_RE.test(supplier) ? supplier : null}
    />
  );
}
