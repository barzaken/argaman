import { notFound } from "next/navigation";

import { StoneEditForm } from "./stone-edit-form";
import { createClient } from "@/lib/supabase/server";
import type { InventoryItemViewRow, OrderViewRow } from "@/lib/db/types";

export default async function EditStonePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: stone, error: stoneError },
    { data: inventoryRows },
    { data: orderItemLinks },
  ] = await Promise.all([
    supabase.from("stones").select("*").eq("id", id).single(),
    supabase
      .from("inventory_items_view")
      .select(
        "id, quantity_available, quantity_total, quantity_reserved, status, finish_level, piece_type, volume_m3, length_m, width_m, height_m, created_at"
      )
      .eq("stone_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("order_items").select("order_id").eq("stone_id", id),
  ]);

  if (stoneError || !stone) notFound();

  const orderIds = [
    ...new Set(
      (orderItemLinks ?? []).map((r) => r.order_id as string).filter(Boolean)
    ),
  ];

  let ordersForStone: OrderViewRow[] = [];
  if (orderIds.length > 0) {
    const { data: ov } = await supabase
      .from("orders_view")
      .select("*")
      .in("id", orderIds)
      .order("order_number", { ascending: false });
    ordersForStone = (ov ?? []) as OrderViewRow[];
  }

  const inventoryForStone = (inventoryRows ?? []) as Pick<
    InventoryItemViewRow,
    | "id"
    | "quantity_available"
    | "quantity_total"
    | "quantity_reserved"
    | "status"
    | "finish_level"
    | "piece_type"
    | "volume_m3"
    | "length_m"
    | "width_m"
    | "height_m"
    | "created_at"
  >[];

  return (
    <StoneEditForm
      stone={{
        id: stone.id as string,
        name: stone.name as string,
        color_hex: stone.color_hex as string,
      }}
      inventoryRows={inventoryForStone}
      orderRows={ordersForStone}
    />
  );
}
