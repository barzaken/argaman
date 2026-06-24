import { notFound, redirect } from "next/navigation";

import { QuoteForm } from "../../quote-form";
import { createClient } from "@/lib/supabase/server";
import type {
  CustomerRow,
  CustomerStonePriceRow,
  QuoteItemViewRow,
  QuoteViewRow,
  StoneRow,
} from "@/lib/db/types";

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quote, error } = await supabase
    .from("quotes_view")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !quote) notFound();

  const q = quote as QuoteViewRow;

  if (q.status !== "open") {
    redirect(`/dashboard/quotes/${id}`);
  }

  const [{ data: customers }, { data: stones }, { data: overrides }, { data: items }] =
    await Promise.all([
      supabase.from("customers").select("*").eq("is_active", true).order("name"),
      supabase.from("stones").select("*").eq("is_active", true).order("name"),
      supabase.from("customer_stone_prices").select("*"),
      supabase.from("quote_items_view").select("*").eq("quote_id", id),
    ]);

  return (
    <QuoteForm
      mode="edit"
      quote={q}
      initialLines={(items ?? []) as QuoteItemViewRow[]}
      customers={(customers ?? []) as CustomerRow[]}
      stones={(stones ?? []) as StoneRow[]}
      overrides={(overrides ?? []) as CustomerStonePriceRow[]}
    />
  );
}
