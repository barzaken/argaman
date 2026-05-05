import { DebtorsExplorer } from "./debtors-explorer";
import { createClient } from "@/lib/supabase/server";
import type { DebtorsViewRow } from "@/lib/db/types";

export default async function DebtorsPage() {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("debtors_view")
    .select("*")
    .order("payment_due_date", { ascending: true });

  if (error) {
    return (
      <div className="p-6">
        <p className="text-destructive text-sm">{error.message}</p>
      </div>
    );
  }

  return <DebtorsExplorer rows={(rows ?? []) as DebtorsViewRow[]} />;
}
