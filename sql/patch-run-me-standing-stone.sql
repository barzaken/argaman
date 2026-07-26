-- =============================================================================
-- Argaman CRM — פאץ׳ מוכן להרצה
-- =============================================================================
-- מה זה מתקן:
--   מוסיף את סוג החלק "אבן עומדת" (standing_stone) ל-enum inventory_piece_type
--   ומעדכן את הערה על העמודה piece_type.
--
-- איך להריץ:
--   1. Supabase Dashboard → SQL Editor
--   2. הדבק את כל הקובץ → Run
--   3. (אופציונלי) Settings → API → Reload schema אם יש cache ישן
--
-- בטוח להרצה חוזרת (idempotent).
-- =============================================================================

ALTER TYPE public.inventory_piece_type
  ADD VALUE IF NOT EXISTS 'standing_stone';

COMMENT ON COLUMN public.inventory_items.piece_type IS
  'סוג חלק: panel=פאנל, frame=מסגרת, plate=פלטה, standing_stone=אבן עומדת';

-- בדיקה מהירה (אמור להחזיר גם standing_stone):
-- SELECT enumlabel
-- FROM pg_enum e
-- JOIN pg_type t ON t.oid = e.enumtypid
-- WHERE t.typname = 'inventory_piece_type'
-- ORDER BY e.enumsortorder;
