import { QuoteForm } from "../quote-form";
import { createClient } from "@/lib/supabase/server";
import type {
  CustomerRow,
  CustomerStonePriceRow,
  StoneRow,
} from "@/lib/db/types";

export default async function NewQuotePage() {
  const supabase = await createClient();

  const [{ data: customers }, { data: stones }, { data: overrides }] =
    await Promise.all([
      supabase.from("customers").select("*").eq("is_active", true).order("name"),
      supabase.from("stones").select("*").eq("is_active", true).order("name"),
      supabase.from("customer_stone_prices").select("*"),
    ]);

  return (
    <QuoteForm
      mode="create"
      customers={(customers ?? []) as CustomerRow[]}
      stones={(stones ?? []) as StoneRow[]}
      overrides={(overrides ?? []) as CustomerStonePriceRow[]}
    />
  );
}
