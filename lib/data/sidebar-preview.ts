import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DeliveryOrderItem,
  StoneItem,
} from "@/components/sidebar/types";
import type { InventoryItemViewRow } from "@/lib/db/types";
import type { DeliveryViewRow } from "@/lib/db/types";

export type SidebarPreviewData = {
  inStock: StoneItem[];
  outOfStock: StoneItem[];
  deliveryOrders: DeliveryOrderItem[];
};

function mapInventoryRow(
  row: Pick<
    InventoryItemViewRow,
    "id" | "stone_name" | "polish_type" | "color_hex" | "quantity_available"
  >
): StoneItem {
  return {
    id: row.id,
    title: `${row.stone_name} · ${row.polish_type} (${row.quantity_available} זמין)`,
    href: `/dashboard/inventory/${row.id}/edit`,
    icon: "gem",
    colorHex: row.color_hex,
  };
}

function mapInventoryRowNoQty(
  row: Pick<
    InventoryItemViewRow,
    "id" | "stone_name" | "polish_type" | "color_hex"
  >
): StoneItem {
  return {
    id: row.id,
    title: `${row.stone_name} · ${row.polish_type}`,
    href: `/dashboard/inventory/${row.id}/edit`,
    icon: "package",
    colorHex: row.color_hex,
  };
}

function mapDeliveryRow(
  row: Pick<DeliveryViewRow, "id" | "delivery_number" | "customer_name">
): DeliveryOrderItem {
  return {
    id: row.id,
    title: `ת.משלוח #${row.delivery_number} — ${row.customer_name}`,
    href: `/dashboard/deliveries/${row.id}`,
    icon: "truck",
  };
}

export async function buildSidebarPreview(
  supabase: SupabaseClient
): Promise<SidebarPreviewData> {
  const { data: available } = await supabase
    .from("inventory_items_view")
    .select(
      "id, stone_name, polish_type, color_hex, quantity_available, status"
    )
    .gt("quantity_available", 0)
    .in("status", ["available", "in_transit"])
    .order("created_at", { ascending: false })
    .limit(12);

  const { data: notAvailable } = await supabase
    .from("inventory_items_view")
    .select("id, stone_name, polish_type, color_hex, quantity_available, status")
    .lte("quantity_available", 0)
    .order("created_at", { ascending: false })
    .limit(12);

  const { data: deliveries } = await supabase
    .from("deliveries_view")
    .select("id, delivery_number, customer_name")
    .order("created_at", { ascending: false })
    .limit(8);

  return {
    inStock: (available ?? []).map((r) =>
      mapInventoryRow(r as InventoryItemViewRow)
    ),
    outOfStock: (notAvailable ?? []).map((r) =>
      mapInventoryRowNoQty(r as InventoryItemViewRow)
    ),
    deliveryOrders: (deliveries ?? []).map((r) =>
      mapDeliveryRow(r as DeliveryViewRow)
    ),
  };
}
