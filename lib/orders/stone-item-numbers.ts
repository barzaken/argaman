/** Assign sequential "פריט N" numbers by stone type (same stone → same number). */
export function buildStoneItemNumberMap(
  lines: { stone_id: string | null | undefined }[]
): Map<string, number> {
  const map = new Map<string, number>();
  let next = 1;
  for (const ln of lines) {
    const sid = ln.stone_id?.trim();
    if (!sid || map.has(sid)) continue;
    map.set(sid, next);
    next += 1;
  }
  return map;
}

export function getStoneItemNumber(
  lines: { stone_id: string | null | undefined }[],
  index: number
): number | null {
  const sid = lines[index]?.stone_id?.trim();
  if (!sid) return null;
  return buildStoneItemNumberMap(lines).get(sid) ?? null;
}

export type StoneLineGroup<T extends { key: string; stone_id: string }> = {
  /** stone_id when assigned, otherwise empty-${line.key} */
  groupKey: string;
  stone_id: string;
  itemNumber: number | null;
  lines: T[];
};

/** Group consecutive form lines into one block per stone type. */
export function groupLinesByStone<T extends { key: string; stone_id: string }>(
  lines: T[]
): StoneLineGroup<T>[] {
  const groups: StoneLineGroup<T>[] = [];
  const byStone = new Map<string, StoneLineGroup<T>>();
  const numbers = buildStoneItemNumberMap(lines);

  for (const ln of lines) {
    const sid = ln.stone_id?.trim() ?? "";
    if (sid) {
      let group = byStone.get(sid);
      if (!group) {
        group = {
          groupKey: sid,
          stone_id: sid,
          itemNumber: numbers.get(sid) ?? null,
          lines: [],
        };
        byStone.set(sid, group);
        groups.push(group);
      }
      group.lines.push(ln);
    } else {
      groups.push({
        groupKey: `empty-${ln.key}`,
        stone_id: "",
        itemNumber: null,
        lines: [ln],
      });
    }
  }

  return groups;
}
