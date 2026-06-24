import { notFound } from "next/navigation";

import { QuoteDocument } from "@/components/quotes/quote-document";
import { createClient } from "@/lib/supabase/server";
import type { QuoteItemViewRow, QuoteViewRow } from "@/lib/db/types";

export default async function QuoteDetailPage({
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

  const [{ data: items }, { data: customer }] = await Promise.all([
    supabase.from("quote_items_view").select("*").eq("quote_id", id),
    supabase
      .from("customers")
      .select("tax_id, address, phone")
      .eq("id", q.customer_id)
      .single(),
  ]);

  if (!customer) notFound();

  return (
    <QuoteDocument
      quote={q}
      customer={{
        tax_id: customer.tax_id,
        address: customer.address,
        phone: customer.phone,
      }}
      lines={(items ?? []) as QuoteItemViewRow[]}
      quoteId={id}
    />
  );
}
