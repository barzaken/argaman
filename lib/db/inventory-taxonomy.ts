import { metersToCmInput } from "./calculations";
import type { InventoryFinishLevelDb, InventoryPieceTypeDb } from "./types";

export const INVENTORY_FINISH_LEVEL_OPTIONS: {
  value: InventoryFinishLevelDb;
  label: string;
}[] = [
  { value: "halak", label: "חלק" },
  { value: "tuboza", label: "טובזה" },
  { value: "masmesm", label: "מסמסם" },
];

export const INVENTORY_PIECE_TYPE_OPTIONS: {
  value: InventoryPieceTypeDb;
  label: string;
}[] = [
  { value: "panel", label: "פאנל" },
  { value: "frame", label: "מסגרת" },
  { value: "plate", label: "פלטה" },
];

export const inventoryFinishLevelLabels: Record<
  InventoryFinishLevelDb,
  string
> = {
  halak: "חלק",
  tuboza: "טובזה",
  masmesm: "מסמסם",
};

export const inventoryPieceTypeLabels: Record<InventoryPieceTypeDb, string> = {
  panel: "פאנל",
  frame: "מסגרת",
  plate: "פלטה",
};

export function inventoryShipmentDescriptor(
  finish: InventoryFinishLevelDb,
  piece: InventoryPieceTypeDb
): string {
  return `${inventoryFinishLevelLabels[finish]} · ${inventoryPieceTypeLabels[piece]}`;
}

/** תווית לבחירת משלוח מלאי: זמין, אבן, חלק, גימור, מידות בס״מ */
export function formatInventoryShipmentSelectLabel(row: {
  stone_name: string;
  finish_level: InventoryFinishLevelDb;
  piece_type: InventoryPieceTypeDb;
  length_m: number;
  width_m: number;
  height_m: number;
  quantity_available: number;
}): string {
  const L = metersToCmInput(Number(row.length_m));
  const W = metersToCmInput(Number(row.width_m));
  const H = metersToCmInput(Number(row.height_m));
  const piece = inventoryPieceTypeLabels[row.piece_type];
  const finish = inventoryFinishLevelLabels[row.finish_level];
  return `זמין ${row.quantity_available} ${row.stone_name} ${piece} ${finish}, ${L}×${W}×${H}`;
}
