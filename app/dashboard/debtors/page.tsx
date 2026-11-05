import { DebtorsExplorer } from "./debtors-explorer";
import { createClient } from "@/lib/supabase/server";
import { toHebrewError } from "@/lib/db/errors";
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
        <p className="text-destructive text-sm">{toHebrewError(error, "טעינת הנתונים נכשלה. נסו לרענן את הדף.")}</p>
      </div>
    );
  }

  return <DebtorsExplorer rows={(rows ?? []) as DebtorsViewRow[]} />;
}
