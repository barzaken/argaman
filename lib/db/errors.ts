/**
 * ממיר שגיאות Postgres / PostgREST / Supabase Auth להודעות בעברית שמשתמש
 * הקצה יכול להבין. השגיאה המקורית נרשמת בלוג של השרת לצורכי דיבאג.
 */

type DbErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

const RULES: { test: RegExp; message: string }[] = [
  { test: /insufficient quantity/i, message: "אין מספיק כמות זמינה במלאי עבור אחד הפריטים." },
  { test: /customers_tax_id_unique/i, message: "כבר קיים לקוח עם ח.פ / ת״ז זה." },
  { test: /stones_active_name_unique/i, message: "כבר קיימת אבן פעילה בשם זה בקטלוג." },
  { test: /customer_stone_prices_unique/i, message: "כבר הוגדר מחיר מיוחד לאבן זו אצל הלקוח." },
  { test: /deliveries_order_id_key/i, message: "כבר קיימת תעודת משלוח להזמנה זו." },
  { test: /cannot cancel order with delivery/i, message: "לא ניתן לבטל הזמנה שכבר הופקה לה תעודת משלוח." },
  { test: /cannot create delivery for cancelled order/i, message: "לא ניתן להפיק תעודת משלוח להזמנה מבוטלת." },
  { test: /stone does not match inventory/i, message: "המשלוח שנבחר במלאי לא תואם לאבן שנבחרה." },
  { test: /stone not found or inactive/i, message: "אחת האבנים לא נמצאה או הועברה לארכיון." },
  { test: /quote is not open|quote cannot be edited/i, message: "ניתן לערוך או להמיר רק הצעת מחיר פתוחה." },
  { test: /cannot delete converted quote/i, message: "לא ניתן למחוק הצעת מחיר שכבר הומרה להזמנה." },
  { test: /item mapping count mismatch/i, message: "ההצעה השתנתה בינתיים — רעננו את הדף ונסו שוב." },
  { test: /order not found|quote not found/i, message: "הרשומה לא נמצאה — ייתכן שנמחקה." },
  { test: /inventory_qty_sum_chk|inventory_qty_reserved_chk|inventory_qty_delivered_chk/i, message: "הכמויות במלאי לא מסתדרות (מוזמן + סופק גדול מהכמות הכוללת)." },
  { test: /inventory_in_transit_arrival_chk/i, message: "בסטטוס ״בדרך״ חובה תאריך צפי הגעה." },
  { test: /deliveries_shipping_address_chk/i, message: "בשילוח חובה למלא כתובת." },
  { test: /stones_color_hex_chk/i, message: "קוד הצבע אינו תקין." },
  { test: /dims_chk|dims_positive_chk/i, message: "המידות חייבות להיות גדולות מאפס." },
  { test: /qty_chk|qty_total_chk/i, message: "הכמות חייבת להיות גדולה מאפס." },
  { test: /invalid input syntax for type date|date\/time field value out of range/i, message: "תאריך לא תקין." },
  { test: /invalid input syntax for type uuid/i, message: "מזהה לא תקין." },
  { test: /JWT expired|invalid JWT|not authenticated/i, message: "פג תוקף ההתחברות — התחברו מחדש." },
  { test: /row-level security|permission denied/i, message: "אין לכם הרשאה לבצע פעולה זו." },
  { test: /Invalid login credentials/i, message: "אימייל או סיסמה שגויים." },
  { test: /Email not confirmed/i, message: "כתובת האימייל עוד לא אומתה." },
  { test: /rate limit|too many requests/i, message: "יותר מדי ניסיונות — המתינו דקה ונסו שוב." },
  { test: /fetch failed|network|ECONNRESET|ETIMEDOUT/i, message: "אין חיבור לשרת — בדקו את החיבור לאינטרנט ונסו שוב." },
];

export function toHebrewError(
  error: DbErrorLike | null | undefined,
  fallback = "אירעה שגיאה. נסו שוב."
): string {
  if (!error) return fallback;
  const haystack = [error.message, error.details, error.hint, error.code]
    .filter(Boolean)
    .join(" ");

  for (const rule of RULES) {
    if (rule.test.test(haystack)) return rule.message;
  }

  if (error.code === "23503") {
    return "לא ניתן לבצע — קיימות רשומות אחרות שמקושרות לרשומה זו.";
  }
  if (error.code === "23505") return "רשומה זהה כבר קיימת.";
  if (error.code === "PGRST116") return "הרשומה לא נמצאה — ייתכן שנמחקה.";

  console.error("[db] unmapped error:", error);
  return fallback;
}
