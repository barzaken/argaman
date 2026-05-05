import Link from "next/link";

import { Button } from "@/components/ui/button";
import { OrderItemsExplorer } from "./order-items-explorer";
import { createClient } from "@/lib/supabase/server";
import type { OrderItemViewRow } from "@/lib/db/types";

export default async function OrderItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const showAll = view === "all";
  const supabase = await createClient();

  let query = supabase
    .from("order_items_view")
    .select("*");

  if (!showAll) {
    query = query.neq("status", "completed");
  }

  const { data: rows, error } = await query
    .order("created_at", { ascending: false })
    .limit(800);

  if (error) {
    return (
      <div className="p-6">
        <p className="text-destructive text-sm">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-6 md:pt-6">
        <p className="text-muted-foreground text-sm">
          {showAll ? "מציג את כל פריטי ההזמנה." : "מציג פריטי הזמנה פתוחים בלבד."}
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href={showAll ? "/dashboard/order-items" : "/dashboard/order-items?view=all"}>
            {showAll ? "הצג פתוחים" : "הצג הכל"}
          </Link>
        </Button>
      </div>
      <OrderItemsExplorer
        items={(rows ?? []) as OrderItemViewRow[]}
        emptyLabel={showAll ? "אין פריטי הזמנה." : "אין פריטי הזמנה פתוחים."}
      />
    </div>
  );
}
