/**
 * עזרי צד-לקוח לקריאה ל-Server Actions.
 * Server Action יכול "לזרוק" (נפילת רשת, פריסה חדשה בזמן שהדף פתוח וכו׳) —
 * בלי טיפול הכפתור נשאר תקוע על "שומר…" ואין שום הודעה.
 */
export type ActionFailure = { ok: false; message: string };

export function actionCrashed(err: unknown): ActionFailure {
  console.error("[action] failed:", err);
  return {
    ok: false,
    message:
      "הפעולה לא הושלמה — ייתכן שאין חיבור לשרת או שהמערכת עודכנה. רעננו את הדף ונסו שוב.",
  };
}
