-- One-time migration: quotes (הצעות מחיר) — catalog-based, no inventory at creation.
-- Run in Supabase SQL Editor after existing schema is applied.

CREATE TYPE public.quote_status AS ENUM ('open', 'converted', 'cancelled');

CREATE SEQUENCE IF NOT EXISTS quote_number_seq START WITH 1000 INCREMENT BY 1;

CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number bigint NOT NULL DEFAULT nextval('quote_number_seq'),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  status public.quote_status NOT NULL DEFAULT 'open',
  valid_until date,
  notes text,
  vat_rate numeric(5,4) NOT NULL DEFAULT 0.18,
  vat_included boolean NOT NULL DEFAULT false,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  converted_order_id uuid REFERENCES public.orders(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER SEQUENCE quote_number_seq OWNED BY quotes.quote_number;

CREATE TRIGGER quotes_set_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX quotes_customer_id_idx ON public.quotes(customer_id);
CREATE INDEX quotes_status_idx ON public.quotes(status);

CREATE TABLE public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  stone_id uuid NOT NULL REFERENCES public.stones(id),
  length_m numeric(10,3) NOT NULL,
  width_m numeric(10,3) NOT NULL,
  height_m numeric(10,3) NOT NULL,
  quantity integer NOT NULL,
  volume_m3 numeric(12,4) GENERATED ALWAYS AS (
    ROUND((length_m * width_m * height_m * quantity)::numeric, 4)
  ) STORED,
  price_per_m3 numeric(12,2) NOT NULL,
  line_subtotal numeric(12,2) GENERATED ALWAYS AS (
    ROUND(((length_m * width_m * height_m * quantity) * price_per_m3)::numeric, 2)
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_items_dims_chk CHECK (
    length_m > 0 AND width_m > 0 AND height_m > 0
  ),
  CONSTRAINT quote_items_qty_chk CHECK (quantity > 0)
);

CREATE TRIGGER quote_items_set_updated_at
  BEFORE UPDATE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX quote_items_quote_id_idx ON public.quote_items(quote_id);
CREATE INDEX quote_items_stone_id_idx ON public.quote_items(stone_id);

-- -----------------------------------------------------------------------------
-- VIEWS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.quotes_view AS
SELECT
  q.*,
  c.name AS customer_name,
  c.phone AS customer_phone,
  c.email AS customer_email,
  (q.converted_order_id IS NOT NULL) AS has_order,
  (SELECT COUNT(*)::integer FROM public.quote_items qi WHERE qi.quote_id = q.id) AS item_count,
  o.order_number AS converted_order_number
FROM public.quotes q
JOIN public.customers c ON c.id = q.customer_id
LEFT JOIN public.orders o ON o.id = q.converted_order_id;

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

-- -----------------------------------------------------------------------------
-- RPC: create quote + items (atomic)
-- -----------------------------------------------------------------------------
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
    v_price := (v_elem->>'price_per_m3')::numeric;

    IF v_stone_id IS NULL OR v_qty IS NULL OR v_price IS NULL THEN
      RAISE EXCEPTION 'invalid item payload';
    END IF;

    IF v_len IS NULL OR v_wid IS NULL OR v_hgt IS NULL
      OR v_len <= 0 OR v_wid <= 0 OR v_hgt <= 0 THEN
      RAISE EXCEPTION 'invalid dimensions';
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

    INSERT INTO public.quote_items (
      quote_id, stone_id,
      length_m, width_m, height_m, quantity, price_per_m3
    ) VALUES (
      v_quote_id, v_stone_id,
      v_len, v_wid, v_hgt, v_qty, v_price_ex
    );
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

-- -----------------------------------------------------------------------------
-- RPC: update quote + replace items (only when open)
-- -----------------------------------------------------------------------------
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
    v_price := (v_elem->>'price_per_m3')::numeric;

    IF v_stone_id IS NULL OR v_qty IS NULL OR v_price IS NULL THEN
      RAISE EXCEPTION 'invalid item payload';
    END IF;

    IF v_len IS NULL OR v_wid IS NULL OR v_hgt IS NULL
      OR v_len <= 0 OR v_wid <= 0 OR v_hgt <= 0 THEN
      RAISE EXCEPTION 'invalid dimensions';
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

    INSERT INTO public.quote_items (
      quote_id, stone_id,
      length_m, width_m, height_m, quantity, price_per_m3
    ) VALUES (
      p_quote_id, v_stone_id,
      v_len, v_wid, v_hgt, v_qty, v_price_ex
    );
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

-- -----------------------------------------------------------------------------
-- RPC: delete quote (not converted)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_delete_quote(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_status public.quote_status;
BEGIN
  SELECT status INTO v_status FROM public.quotes WHERE id = p_quote_id FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'quote not found';
  END IF;

  IF v_status = 'converted'::public.quote_status THEN
    RAISE EXCEPTION 'cannot delete converted quote';
  END IF;

  DELETE FROM public.quotes WHERE id = p_quote_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: convert quote to order + reserve inventory (atomic)
-- -----------------------------------------------------------------------------
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
    v_price := qi.price_per_m3;

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

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY quotes_authenticated_all ON public.quotes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY quote_items_authenticated_all ON public.quote_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT EXECUTE ON FUNCTION public.crm_create_quote_with_items(uuid, date, text, numeric, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_update_quote_with_items(uuid, uuid, date, text, numeric, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_delete_quote(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_create_order_from_quote(uuid, public.priority, date, text, jsonb) TO authenticated;
