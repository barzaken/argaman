import { StonesCatalog, type CatalogStone } from "./stones-catalog";
import { createClient } from "@/lib/supabase/server";
import { toHebrewError } from "@/lib/db/errors";

export default async function StonesPage() {
  const supabase = await createClient();

  const [{ data: stones, error }, { data: invRows }] = await Promise.all([
    supabase.from("stones").select("*").eq("is_active", true).order("name"),
    supabase
      .from("inventory_items_view")
      .select("stone_id")
      .gt("quantity_available", 0),
  ]);

  const availStoneIds = new Set(
    (invRows ?? []).map((r) => r.stone_id as string)
  );

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <p className="text-destructive text-sm">{toHebrewError(error, "טעינת הנתונים נכשלה. נסו לרענן את הדף.")}</p>
      </div>
    );
  }

  const catalog: CatalogStone[] = (stones ?? []).map((stone) => ({
    id: stone.id as string,
    name: stone.name as string,
    color_hex: stone.color_hex as string,
    sku: (stone.sku as string | null | undefined) ?? null,
    aliases: Array.isArray(stone.aliases) ? (stone.aliases as string[]) : [],
    inStock: availStoneIds.has(stone.id as string),
  }));

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-auto">
      <div className="flex flex-1 flex-col p-4 md:p-6">
        <div className="mx-auto w-full max-w-[min(100%,80rem)]">
          <StonesCatalog stones={catalog} />
        </div>
      </div>
    </div>
  );
}
