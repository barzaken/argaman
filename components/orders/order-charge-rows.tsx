import { formatIls } from "@/lib/db/format";
import { orderChargeKindLabels } from "@/lib/db/labels";
import type { OrderChargeRow } from "@/lib/db/types";

/** שדות שהמסמכים צריכים מחיוב (תואם OrderChargeRow) */
export type DocumentChargeLine = Pick<
  OrderChargeRow,
  "id" | "kind" | "description" | "amount" | "sort_order"
>;

/**
 * שורות "חיובים נוספים" בטבלת תעודה (הזמנה / משלוח) — כדי שסכום השורות
 * יתאים לסכום לפני מע״מ. סגנון inline בלבד (נשמר בהדפסה / PDF).
 * descriptionSpan = כמה עמודות בין "סכום שורה" לסוף הטבלה מכסה התיאור.
 */
export function OrderChargeRows({
  charges,
  descriptionSpan,
  trailingCells = 0,
}: {
  charges: DocumentChargeLine[];
  descriptionSpan: number;
  /** תאים ריקים אחרי התיאור (למשל עמודת "פריט") */
  trailingCells?: number;
}) {
  if (charges.length === 0) return null;
  const sorted = [...charges].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <>
      {sorted.map((c) => {
        const label = orderChargeKindLabels[c.kind] ?? c.kind;
        const showDescription =
          c.description.trim() && c.description.trim() !== label;
        return (
          <tr key={c.id} data-charge-kind={c.kind}>
            <td className="ods-num ods-strong">{formatIls(Number(c.amount))}</td>
            <td colSpan={descriptionSpan}>
              <span style={{ fontWeight: 600 }}>{label}</span>
              {showDescription ? (
                <span style={{ color: "#6b6358" }}> · {c.description}</span>
              ) : null}
            </td>
            {Array.from({ length: trailingCells }, (_, i) => (
              <td key={i} />
            ))}
          </tr>
        );
      })}
    </>
  );
}

/** בלוק הערות בתעודה (לפני הסיכום) */
export function DocumentNotes({ notes }: { notes: string | null | undefined }) {
  if (!notes?.trim()) return null;
  return (
    <div
      className="ods-meta-card"
      style={{ marginBottom: 16, whiteSpace: "pre-line" }}
    >
      <span className="ods-meta-label">הערות</span>
      <span className="ods-meta-value" style={{ fontWeight: 400 }}>
        {notes}
      </span>
    </div>
  );
}
