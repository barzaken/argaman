-- הועבר לקובץ המאוחד להרצה:
--   sql/patch-run-me-standing-stone.sql
--
-- ניתן להריץ גם את הקובץ הזה — זהה בתוכן.

ALTER TYPE public.inventory_piece_type
  ADD VALUE IF NOT EXISTS 'standing_stone';

COMMENT ON COLUMN public.inventory_items.piece_type IS
  'סוג חלק: panel=פאנל, frame=מסגרת, plate=פלטה, standing_stone=אבן עומדת';
