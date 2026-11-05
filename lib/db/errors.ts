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
  // --- שלב 12: הרשאות, תשלומים, מסמכים, הוצאות, חיובים ---
  { test: /admin only/i, message: "פעולה זו מותרת למנהל בלבד" },
  { test: /last admin/i, message: "חייב להישאר לפחות מנהל אחד במערכת." },
  { test: /invalid role/i, message: "תפקיד לא תקין." },
  { test: /user not found/i, message: "המשתמש לא נמצא." },
  { test: /payment over-allocated/i, message: "סכום ההקצאות לתעודות גדול מסכום התשלום." },
  { test: /delivery over-allocated/i, message: "הסכום שהוקצה לתעודת המשלוח גדול מהיתרה לתשלום שלה." },
  { test: /allocation customer mismatch/i, message: "אפשר להקצות תשלום רק לתעודות משלוח של אותו לקוח." },
  { test: /cannot allocate to cancelled delivery/i, message: "לא ניתן לרשום תשלום על תעודת משלוח מבוטלת." },
  { test: /delivery is covered by payments/i, message: "לתעודה רשומים תשלומים שמכסים אותה — כדי לסמן ״לא שולם״ יש למחוק קודם את התשלום." },
  { test: /invalid payment amount|payments_amount_chk|payment_allocations_amount_chk/i, message: "סכום התשלום חייב להיות גדול מאפס." },
  { test: /invalid allocations payload/i, message: "פירוט ההקצאות לתעודות אינו תקין." },
  { test: /customer required/i, message: "יש לבחור לקוח." },
  { test: /delivery not found/i, message: "תעודת המשלוח לא נמצאה — ייתכן שנמחקה." },
  { test: /payment_allocations_unique/i, message: "התשלום כבר מוקצה לתעודה זו." },
  { test: /order has delivery/i, message: "לא ניתן לשנות חיובים בהזמנה שכבר הופקה לה תעודת משלוח." },
  { test: /order total cannot be negative/i, message: "ההנחה גדולה מסכום ההזמנה." },
  { test: /order_charges_amount_sign_chk/i, message: "הנחה חייבת להיות סכום שלילי, ושאר החיובים סכום חיובי." },
  { test: /order_charges_description_chk/i, message: "יש למלא תיאור לחיוב." },
  { test: /documents_duplicate_unique/i, message: "המסמך כבר הוזן במערכת (אותו סוג, ח.פ ומספר)" },
  { test: /documents_currency_chk|expenses_currency_chk/i, message: "קוד מטבע לא תקין (למשל ILS)." },
  { test: /documents_source_chk/i, message: "מקור המסמך אינו תקין." },
  { test: /suppliers_tax_id_unique/i, message: "כבר קיים ספק עם ח.פ / ע.מ זה." },
  { test: /suppliers_name_chk/i, message: "יש למלא שם ספק." },
  { test: /expenses_supplier_document_unique/i, message: "הוצאה עם מספר מסמך זה כבר נרשמה לספק הזה." },
  { test: /expenses_amount_total_chk/i, message: "סכום ההוצאה לא יכול להיות שלילי." },
  { test: /expenses_document_type_chk/i, message: "סוג מסמך ההוצאה אינו תקין." },
  { test: /expenses_reporting_month_chk/i, message: "חודש הדיווח חייב להיות היום הראשון בחודש." },
  { test: /stones_sku_unique/i, message: "כבר קיימת אבן עם מק״ט זה." },
  { test: /deliveries_paid_outside_payments_chk/i, message: "סכום ששולם מחוץ למערכת לא יכול להיות שלילי." },
  { test: /The object exceeded the maximum allowed size|Payload too large/i, message: "הקובץ גדול מדי (עד 20MB)." },
  { test: /mime type .* is not supported|invalid_mime_type/i, message: "סוג קובץ לא נתמך — אפשר להעלות תמונה (JPG/PNG/WEBP/HEIC) או PDF." },
  { test: /The resource already exists/i, message: "קובץ בשם זה כבר קיים." },
  { test: /Object not found|Bucket not found/i, message: "הקובץ לא נמצא." },
  // --- קיימים ---
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
