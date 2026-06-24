import { notFound, redirect } from "next/navigation";

import { ConvertToOrderForm } from "./convert-to-order-form";
import { createClient } from "@/lib/supabase/server";
import type {
  InventoryItemViewRow,
  QuoteItemViewRow,
  QuoteViewRow,
} from "@/lib/db/types";

export default async function ConvertQuotePage({
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

  if (q.status !== "open" || q.has_order) {
    redirect(`/dashboard/quotes/${id}`);
  }

  const [{ data: lines }, { data: inventory }] = await Promise.all([
    supabase.from("quote_items_view").select("*").eq("quote_id", id),
    supabase
      .from("inventory_items_view")
      .select("*")
      .eq("status", "available")
      .gt("quantity_available", 0)
      .order("created_at", { ascending: false }),
  ]);

  if (!lines?.length) notFound();

  return (
    <ConvertToOrderForm
      quote={q}
      lines={lines as QuoteItemViewRow[]}
      inventory={(inventory ?? []) as InventoryItemViewRow[]}
    />
  );
}
