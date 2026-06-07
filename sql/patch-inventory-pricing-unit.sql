-- יחידת תמחור למלאי: לפי קוב (m3) או לפי מטר רבוע (m2).
--
-- חובה להריץ ב-Supabase → SQL Editor (פעם אחת).
-- אחרי הרצה: אם עדיין מופיעה שגיאת schema cache, בממשק Supabase נסו
-- Project Settings → API → "Reload schema" (או המתנה קצרה).

DO $$
BEGIN
  CREATE TYPE inventory_pricing_unit AS ENUM ('m3', 'm2');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS pricing_unit inventory_pricing_unit NOT NULL DEFAULT 'm3',
  ADD COLUMN IF NOT EXISTS price_per_m2 numeric(12,2);

ALTER TABLE public.inventory_items
  DROP COLUMN IF EXISTS area_m2;

ALTER TABLE public.inventory_items
  ADD COLUMN area_m2 numeric(12,4) GENERATED ALWAYS AS (
    ROUND((length_m * width_m * quantity_total)::numeric, 4)
  ) STORED;

ALTER TABLE public.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_pricing_prices_chk;

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_pricing_prices_chk CHECK (
    (pricing_unit = 'm3'::inventory_pricing_unit AND price_per_m2 IS NULL)
    OR (pricing_unit = 'm2'::inventory_pricing_unit AND price_per_m2 IS NOT NULL)
  );

COMMENT ON COLUMN public.inventory_items.pricing_unit IS
  'יחידת תמחור: m3=לפי קוב, m2=לפי מטר רבוע';
COMMENT ON COLUMN public.inventory_items.price_per_m2 IS
  'מחיר למ״ר — חובה כש-pricing_unit=m2';
COMMENT ON COLUMN public.inventory_items.area_m2 IS
  'שטח פנים כולל (אורך × רוחב × כמות) במ״ר';

DROP VIEW IF EXISTS public.inventory_items_view;

CREATE VIEW public.inventory_items_view AS
SELECT
  i.*,
  s.name AS stone_name,
  s.color_hex,
  (i.quantity_total - i.quantity_reserved - i.quantity_delivered) AS quantity_available
FROM public.inventory_items i
JOIN public.stones s ON s.id = i.stone_id;
