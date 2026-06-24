-- Quote line pricing: m³ / m² / unit (יחידה).
-- Run after patch-quotes.sql if quotes already exist.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quote_pricing_unit') THEN
    CREATE TYPE public.quote_pricing_unit AS ENUM ('m3', 'm2', 'unit');
  END IF;
END $$;

-- Views using qi.* must be dropped before altering generated columns.
DROP VIEW IF EXISTS public.quote_items_view;

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS pricing_unit public.quote_pricing_unit NOT NULL DEFAULT 'm3',
  ADD COLUMN IF NOT EXISTS price_per_m2 numeric(12,2),
  ADD COLUMN IF NOT EXISTS price_per_unit numeric(12,2);

ALTER TABLE public.quote_items
  ALTER COLUMN price_per_m3 DROP NOT NULL;

ALTER TABLE public.quote_items
  DROP COLUMN IF EXISTS area_m2;

ALTER TABLE public.quote_items
  ADD COLUMN area_m2 numeric(12,4) GENERATED ALWAYS AS (
    ROUND((length_m * width_m * quantity)::numeric, 4)
  ) STORED;

ALTER TABLE public.quote_items
  DROP COLUMN IF EXISTS line_subtotal;

ALTER TABLE public.quote_items
  ADD COLUMN line_subtotal numeric(12,2) GENERATED ALWAYS AS (
    CASE pricing_unit
      WHEN 'm3'::public.quote_pricing_unit THEN
        ROUND((length_m * width_m * height_m * quantity * price_per_m3)::numeric, 2)
      WHEN 'm2'::public.quote_pricing_unit THEN
        ROUND((length_m * width_m * quantity * price_per_m2)::numeric, 2)
      WHEN 'unit'::public.quote_pricing_unit THEN
        ROUND((quantity * price_per_unit)::numeric, 2)
    END
  ) STORED;

ALTER TABLE public.quote_items
  DROP CONSTRAINT IF EXISTS quote_items_pricing_prices_chk;

ALTER TABLE public.quote_items
  ADD CONSTRAINT quote_items_pricing_prices_chk CHECK (
    (pricing_unit = 'm3'::public.quote_pricing_unit
      AND price_per_m3 IS NOT NULL
      AND price_per_m2 IS NULL
      AND price_per_unit IS NULL)
    OR (pricing_unit = 'm2'::public.quote_pricing_unit
      AND price_per_m2 IS NOT NULL
      AND price_per_m3 IS NULL
      AND price_per_unit IS NULL)
    OR (pricing_unit = 'unit'::public.quote_pricing_unit
      AND price_per_unit IS NOT NULL
      AND price_per_m3 IS NULL
      AND price_per_m2 IS NULL)
  );

CREATE OR REPLACE VIEW public.quote_items_view AS
SELECT
  qi.*,
  q.quote_number,
  q.customer_id,
  q.status AS quote_status,
  q.valid_until AS quote_valid_until,
  q.vat_rate AS quote_vat_rate,
  q.vat_included AS quote_vat_included,
  c.name AS customer_name,
  s.name AS stone_name,
  s.color_hex AS stone_color_hex
FROM public.quote_items qi
JOIN public.quotes q ON q.id = qi.quote_id
JOIN public.customers c ON c.id = q.customer_id
JOIN public.stones s ON s.id = qi.stone_id;

-- Helper: normalize quote line price to order price_per_m3
CREATE OR REPLACE FUNCTION public.quote_item_price_per_m3_for_order(
  p_pricing_unit public.quote_pricing_unit,
  p_length_m numeric,
  p_width_m numeric,
  p_height_m numeric,
  p_price_per_m3 numeric,
  p_price_per_m2 numeric,
  p_price_per_unit numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_pricing_unit
    WHEN 'm3'::public.quote_pricing_unit THEN p_price_per_m3
    WHEN 'm2'::public.quote_pricing_unit THEN
      ROUND((p_price_per_m2 / NULLIF(p_height_m, 0))::numeric, 4)
    WHEN 'unit'::public.quote_pricing_unit THEN
      ROUND((
        p_price_per_unit / NULLIF(p_length_m * p_width_m * p_height_m, 0)
      )::numeric, 4)
  END;
$$;

CREATE OR REPLACE FUNCTION public.crm_create_quote_with_items(
  p_customer_id uuid,
  p_valid_until date,
  p_notes text,
  p_vat_rate numeric,
  p_vat_included boolean,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_quote_id uuid;
  v_elem jsonb;
  v_stone_id uuid;
  v_len numeric;
  v_wid numeric;
  v_hgt numeric;
  v_qty integer;
  v_price numeric;
  v_price_ex numeric;
  v_subtotal numeric;
  v_factor numeric;
  v_unit public.quote_pricing_unit;
BEGIN
  IF p_vat_rate IS NULL OR p_vat_rate < 0 THEN
    RAISE EXCEPTION 'invalid vat_rate';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items required';
  END IF;

  v_factor := 1 + p_vat_rate;

  INSERT INTO public.quotes (
    customer_id, valid_until, notes,
    vat_rate, vat_included, subtotal, vat_amount, total
  ) VALUES (
    p_customer_id, p_valid_until, NULLIF(TRIM(p_notes), ''),
    p_vat_rate, COALESCE(p_vat_included, false), 0, 0, 0
  )
  RETURNING id INTO v_quote_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_stone_id := (v_elem->>'stone_id')::uuid;
    v_len := (v_elem->>'length_m')::numeric;
    v_wid := (v_elem->>'width_m')::numeric;
    v_hgt := (v_elem->>'height_m')::numeric;
    v_qty := (v_elem->>'quantity')::integer;
    v_unit := COALESCE(
      (v_elem->>'pricing_unit')::public.quote_pricing_unit,
      'm3'::public.quote_pricing_unit
    );

    IF v_unit = 'm3'::public.quote_pricing_unit THEN
      v_price := (v_elem->>'price_per_m3')::numeric;
    ELSIF v_unit = 'm2'::public.quote_pricing_unit THEN
      v_price := (v_elem->>'price_per_m2')::numeric;
    ELSE
      v_price := (v_elem->>'price_per_unit')::numeric;
    END IF;

    IF v_stone_id IS NULL OR v_qty IS NULL OR v_price IS NULL THEN
      RAISE EXCEPTION 'invalid item payload';
    END IF;

    IF v_len IS NULL OR v_wid IS NULL OR v_len <= 0 OR v_wid <= 0 THEN
      RAISE EXCEPTION 'invalid length or width';
    END IF;

    IF v_unit = 'm3'::public.quote_pricing_unit THEN
      IF v_hgt IS NULL OR v_hgt <= 0 THEN
        RAISE EXCEPTION 'invalid height for m3 pricing';
      END IF;
    ELSE
      v_hgt := COALESCE(NULLIF(v_hgt, 0), 0.02);
    END IF;

    IF v_qty <= 0 OR v_price < 0 THEN
      RAISE EXCEPTION 'invalid quantity or price';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.stones s WHERE s.id = v_stone_id AND s.is_active) THEN
      RAISE EXCEPTION 'stone not found or inactive';
    END IF;

    IF p_vat_included THEN
      v_price_ex := ROUND((v_price / v_factor)::numeric, 4);
    ELSE
      v_price_ex := v_price;
    END IF;

    IF v_unit = 'm3'::public.quote_pricing_unit THEN
      INSERT INTO public.quote_items (
        quote_id, stone_id, pricing_unit,
        length_m, width_m, height_m, quantity, price_per_m3
      ) VALUES (
        v_quote_id, v_stone_id, v_unit,
        v_len, v_wid, v_hgt, v_qty, v_price_ex
      );
    ELSIF v_unit = 'm2'::public.quote_pricing_unit THEN
      INSERT INTO public.quote_items (
        quote_id, stone_id, pricing_unit,
        length_m, width_m, height_m, quantity, price_per_m2
      ) VALUES (
        v_quote_id, v_stone_id, v_unit,
        v_len, v_wid, v_hgt, v_qty, v_price_ex
      );
    ELSE
      INSERT INTO public.quote_items (
        quote_id, stone_id, pricing_unit,
        length_m, width_m, height_m, quantity, price_per_unit
      ) VALUES (
        v_quote_id, v_stone_id, v_unit,
        v_len, v_wid, v_hgt, v_qty, v_price_ex
      );
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(line_subtotal), 0) INTO v_subtotal
  FROM public.quote_items
  WHERE quote_id = v_quote_id;

  UPDATE public.quotes
  SET
    subtotal = v_subtotal,
    vat_amount = ROUND((v_subtotal * p_vat_rate)::numeric, 2),
    total = ROUND((v_subtotal * (1 + p_vat_rate))::numeric, 2)
  WHERE id = v_quote_id;

  RETURN v_quote_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_update_quote_with_items(
  p_quote_id uuid,
  p_customer_id uuid,
  p_valid_until date,
  p_notes text,
  p_vat_rate numeric,
  p_vat_included boolean,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_status public.quote_status;
  v_elem jsonb;
  v_stone_id uuid;
  v_len numeric;
  v_wid numeric;
  v_hgt numeric;
  v_qty integer;
  v_price numeric;
  v_price_ex numeric;
  v_subtotal numeric;
  v_factor numeric;
  v_unit public.quote_pricing_unit;
BEGIN
  SELECT status INTO v_status FROM public.quotes WHERE id = p_quote_id FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'quote not found';
  END IF;

  IF v_status <> 'open'::public.quote_status THEN
    RAISE EXCEPTION 'quote cannot be edited in status %', v_status;
  END IF;

  IF p_vat_rate IS NULL OR p_vat_rate < 0 THEN
    RAISE EXCEPTION 'invalid vat_rate';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items required';
  END IF;

  v_factor := 1 + p_vat_rate;

  UPDATE public.quotes
  SET
    customer_id = p_customer_id,
    valid_until = p_valid_until,
    notes = NULLIF(TRIM(p_notes), ''),
    vat_rate = p_vat_rate,
    vat_included = COALESCE(p_vat_included, false)
  WHERE id = p_quote_id;

  DELETE FROM public.quote_items WHERE quote_id = p_quote_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_stone_id := (v_elem->>'stone_id')::uuid;
    v_len := (v_elem->>'length_m')::numeric;
    v_wid := (v_elem->>'width_m')::numeric;
    v_hgt := (v_elem->>'height_m')::numeric;
    v_qty := (v_elem->>'quantity')::integer;
    v_unit := COALESCE(
      (v_elem->>'pricing_unit')::public.quote_pricing_unit,
      'm3'::public.quote_pricing_unit
    );

    IF v_unit = 'm3'::public.quote_pricing_unit THEN
      v_price := (v_elem->>'price_per_m3')::numeric;
    ELSIF v_unit = 'm2'::public.quote_pricing_unit THEN
      v_price := (v_elem->>'price_per_m2')::numeric;
    ELSE
      v_price := (v_elem->>'price_per_unit')::numeric;
    END IF;

    IF v_stone_id IS NULL OR v_qty IS NULL OR v_price IS NULL THEN
      RAISE EXCEPTION 'invalid item payload';
    END IF;

    IF v_len IS NULL OR v_wid IS NULL OR v_len <= 0 OR v_wid <= 0 THEN
      RAISE EXCEPTION 'invalid length or width';
    END IF;

    IF v_unit = 'm3'::public.quote_pricing_unit THEN
      IF v_hgt IS NULL OR v_hgt <= 0 THEN
        RAISE EXCEPTION 'invalid height for m3 pricing';
      END IF;
    ELSE
      v_hgt := COALESCE(NULLIF(v_hgt, 0), 0.02);
    END IF;

    IF v_qty <= 0 OR v_price < 0 THEN
      RAISE EXCEPTION 'invalid quantity or price';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.stones s WHERE s.id = v_stone_id AND s.is_active) THEN
      RAISE EXCEPTION 'stone not found or inactive';
    END IF;

    IF p_vat_included THEN
      v_price_ex := ROUND((v_price / v_factor)::numeric, 4);
    ELSE
      v_price_ex := v_price;
    END IF;

    IF v_unit = 'm3'::public.quote_pricing_unit THEN
      INSERT INTO public.quote_items (
        quote_id, stone_id, pricing_unit,
        length_m, width_m, height_m, quantity, price_per_m3
      ) VALUES (
        p_quote_id, v_stone_id, v_unit,
        v_len, v_wid, v_hgt, v_qty, v_price_ex
      );
    ELSIF v_unit = 'm2'::public.quote_pricing_unit THEN
      INSERT INTO public.quote_items (
        quote_id, stone_id, pricing_unit,
        length_m, width_m, height_m, quantity, price_per_m2
      ) VALUES (
        p_quote_id, v_stone_id, v_unit,
        v_len, v_wid, v_hgt, v_qty, v_price_ex
      );
    ELSE
      INSERT INTO public.quote_items (
        quote_id, stone_id, pricing_unit,
        length_m, width_m, height_m, quantity, price_per_unit
      ) VALUES (
        p_quote_id, v_stone_id, v_unit,
        v_len, v_wid, v_hgt, v_qty, v_price_ex
      );
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(line_subtotal), 0) INTO v_subtotal
  FROM public.quote_items
  WHERE quote_id = p_quote_id;

  UPDATE public.quotes
  SET
    subtotal = v_subtotal,
    vat_amount = ROUND((v_subtotal * p_vat_rate)::numeric, 2),
    total = ROUND((v_subtotal * (1 + p_vat_rate))::numeric, 2)
  WHERE id = p_quote_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_create_order_from_quote(
  p_quote_id uuid,
  p_priority public.priority,
  p_supply_due_date date,
  p_signature_url text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotes%ROWTYPE;
  v_order_id uuid;
  v_elem jsonb;
  v_quote_item_id uuid;
  v_inv_id uuid;
  v_stone_id uuid;
  v_len numeric;
  v_wid numeric;
  v_hgt numeric;
  v_qty integer;
  v_price numeric;
  v_avail integer;
  v_subtotal numeric;
  v_item_count integer;
  inv public.inventory_items%ROWTYPE;
  qi public.quote_items%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_quote FROM public.quotes WHERE id = p_quote_id FOR UPDATE;

  IF v_quote.status <> 'open'::public.quote_status THEN
    RAISE EXCEPTION 'quote is not open';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items required';
  END IF;

  SELECT COUNT(*)::integer INTO v_item_count
  FROM public.quote_items
  WHERE quote_id = p_quote_id;

  IF v_item_count <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'item mapping count mismatch';
  END IF;

  INSERT INTO public.orders (
    customer_id, priority, supply_due_date, signature_url,
    vat_rate, vat_included, subtotal, vat_amount, total
  ) VALUES (
    v_quote.customer_id, p_priority, p_supply_due_date, p_signature_url,
    v_quote.vat_rate, v_quote.vat_included, 0, 0, 0
  )
  RETURNING id INTO v_order_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_quote_item_id := (v_elem->>'quote_item_id')::uuid;
    v_inv_id := (v_elem->>'inventory_item_id')::uuid;

    IF v_quote_item_id IS NULL OR v_inv_id IS NULL THEN
      RAISE EXCEPTION 'invalid item mapping payload';
    END IF;

    SELECT * INTO STRICT qi
    FROM public.quote_items
    WHERE id = v_quote_item_id AND quote_id = p_quote_id;

    v_stone_id := qi.stone_id;
    v_len := qi.length_m;
    v_wid := qi.width_m;
    v_hgt := qi.height_m;
    v_qty := qi.quantity;
    v_price := public.quote_item_price_per_m3_for_order(
      qi.pricing_unit,
      qi.length_m,
      qi.width_m,
      qi.height_m,
      qi.price_per_m3,
      qi.price_per_m2,
      qi.price_per_unit
    );

    IF v_price IS NULL OR v_price < 0 THEN
      RAISE EXCEPTION 'invalid derived price for quote item %', v_quote_item_id;
    END IF;

    SELECT * INTO STRICT inv FROM public.inventory_items WHERE id = v_inv_id FOR UPDATE;

    IF inv.stone_id <> v_stone_id THEN
      RAISE EXCEPTION 'stone does not match inventory shipment';
    END IF;

    v_avail := inv.quantity_total - inv.quantity_reserved - inv.quantity_delivered;
    IF v_avail < v_qty THEN
      RAISE EXCEPTION 'insufficient quantity for inventory %', v_inv_id;
    END IF;

    INSERT INTO public.order_items (
      order_id, stone_id, inventory_item_id,
      length_m, width_m, height_m, quantity, price_per_m3
    ) VALUES (
      v_order_id, v_stone_id, v_inv_id,
      v_len, v_wid, v_hgt, v_qty, v_price
    );

    UPDATE public.inventory_items
    SET quantity_reserved = quantity_reserved + v_qty
    WHERE id = v_inv_id;
  END LOOP;

  SELECT COALESCE(SUM(line_subtotal), 0) INTO v_subtotal
  FROM public.order_items
  WHERE order_id = v_order_id;

  UPDATE public.orders
  SET
    subtotal = v_subtotal,
    vat_amount = ROUND((v_subtotal * v_quote.vat_rate)::numeric, 2),
    total = ROUND((v_subtotal * (1 + v_quote.vat_rate))::numeric, 2)
  WHERE id = v_order_id;

  UPDATE public.quotes
  SET
    status = 'converted'::public.quote_status,
    converted_order_id = v_order_id
  WHERE id = p_quote_id;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.quote_item_price_per_m3_for_order(
  public.quote_pricing_unit, numeric, numeric, numeric, numeric, numeric, numeric
) TO authenticated;
