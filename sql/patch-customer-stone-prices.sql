-- One-time migration: customer price overrides by catalog stone (not inventory batch).
-- Prerequisites: existing DB still has public.customer_inventory_prices.
-- If you already use customer_stone_prices from a fresh schema, skip this file.

CREATE TABLE public.customer_stone_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  stone_id uuid NOT NULL REFERENCES public.stones(id) ON DELETE CASCADE,
  price_per_m3 numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_stone_prices_unique UNIQUE (customer_id, stone_id)
);

CREATE INDEX customer_stone_prices_customer_id_idx
  ON public.customer_stone_prices (customer_id);

CREATE TRIGGER customer_stone_prices_set_updated_at
  BEFORE UPDATE ON public.customer_stone_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Prefer מחיר ללקוח from legacy row, else מחיר לקו״ב
INSERT INTO public.customer_stone_prices (
  customer_id, stone_id, price_per_m3, created_at, updated_at
)
SELECT DISTINCT ON (cip.customer_id, ii.stone_id)
  cip.customer_id,
  ii.stone_id,
  COALESCE(cip.customer_price, cip.price_per_m3),
  cip.created_at,
  cip.updated_at
FROM public.customer_inventory_prices cip
JOIN public.inventory_items ii ON ii.id = cip.inventory_item_id
WHERE cip.customer_price IS NOT NULL OR cip.price_per_m3 IS NOT NULL
ORDER BY cip.customer_id, ii.stone_id, cip.updated_at DESC;

DROP POLICY IF EXISTS customer_inventory_prices_authenticated_all
  ON public.customer_inventory_prices;

DROP TABLE public.customer_inventory_prices;

ALTER TABLE public.customer_stone_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_stone_prices_authenticated_all ON public.customer_stone_prices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
