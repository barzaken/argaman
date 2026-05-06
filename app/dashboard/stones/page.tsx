import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

export default async function StonesPage() {
  const supabase = await createClient();

  const { data: stones, error } = await supabase
    .from("stones")
    .select("*")
    .eq("is_active", true)
    .order("name");

  const { data: invRows } = await supabase
    .from("inventory_items_view")
    .select("stone_id")
    .gt("quantity_available", 0);

  const availStoneIds = new Set(
    (invRows ?? []).map((r) => r.stone_id as string)
  );

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <p className="text-destructive text-sm">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-auto">
      <div className="flex flex-1 flex-col p-4 md:p-6">
        <div className="mx-auto w-full max-w-[min(100%,80rem)]">
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-4 xl:grid-cols-4">
            {(stones ?? []).map((stone) => (
              <li key={stone.id}>
                <Link
                  href={`/dashboard/stones/${stone.id}/edit`}
                  className="block overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors hover:bg-muted/30 hover:border-muted-foreground/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div
                    className="h-36 w-full border-b border-black/10"
                    style={{
                      backgroundColor: stone.color_hex as string,
                    }}
                    aria-hidden
                  />
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-base font-semibold text-card-foreground">
                        {stone.name as string}
                      </h2>
                      {availStoneIds.has(stone.id as string) ? (
                        <Badge variant="secondary" className="shrink-0">
                          במלאי
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {(stones ?? []).length === 0 ? (
            <p className="py-12 text-center text-muted-foreground text-sm">
              אין אבנים בקטלוג. הוסיפו אבן חדשה.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
