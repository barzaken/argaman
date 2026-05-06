-- רמת גימור (חלק / טובזה / מסמסם) וסוג חלק (פאנל / מסגרת / פלטה) לפריטי מלאי.
--
-- חובה להריץ ב-Supabase → SQL Editor (פעם אחת).
-- אחרי הרצה: אם עדיין מופיעה שגיאת schema cache, בממשק Supabase נסו
-- Project Settings → API → "Reload schema" (או המתנה קצרה).
--
-- הערה: inventory_items_view משתמש ב־i.* — ב-PostgreSQL העמודות נקבעות בזמן
-- CREATE VIEW. אחרי ADD COLUMN חייבים ליצור מחדש את ה-view, אחרת PostgREST
-- לא יראה את finish_level / piece_type.

DO $$
BEGIN
  CREATE TYPE inventory_finish_level AS ENUM ('halak', 'tuboza', 'masmesm');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TYPE inventory_piece_type AS ENUM ('panel', 'frame', 'plate');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS finish_level inventory_finish_level NOT NULL DEFAULT 'halak',
  ADD COLUMN IF NOT EXISTS piece_type inventory_piece_type NOT NULL DEFAULT 'panel';

COMMENT ON COLUMN public.inventory_items.finish_level IS
  'רמת גימור: halak=חלק, tuboza=טובזה, masmesm=מסמסם';
COMMENT ON COLUMN public.inventory_items.piece_type IS
  'סוג חלק: panel=פאנל, frame=מסגרת, plate=פלטה';

-- רענון ה-view כדי שיכלול את העמודות החדשות ב־i.*
DROP VIEW IF EXISTS public.inventory_items_view;

CREATE VIEW public.inventory_items_view AS
SELECT
  i.*,
  s.name AS stone_name,
  s.color_hex,
  (i.quantity_total - i.quantity_reserved - i.quantity_delivered) AS quantity_available
FROM public.inventory_items i
JOIN public.stones s ON s.id = i.stone_id;
