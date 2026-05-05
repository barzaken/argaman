-- Run if customer_stone_prices still has both price_per_m3 and customer_price
-- (older schema before single-field מחיר קו״ב ללקוח).

UPDATE public.customer_stone_prices
SET price_per_m3 = COALESCE(customer_price, price_per_m3);

DELETE FROM public.customer_stone_prices WHERE price_per_m3 IS NULL;

ALTER TABLE public.customer_stone_prices
  DROP CONSTRAINT IF EXISTS customer_stone_prices_one_price_chk;

ALTER TABLE public.customer_stone_prices
  DROP COLUMN IF EXISTS customer_price;

ALTER TABLE public.customer_stone_prices
  ALTER COLUMN price_per_m3 SET NOT NULL;
