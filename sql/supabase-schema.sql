-- Argaman CRM schema for Supabase (run in SQL Editor)
-- Requires: public schema; enables RLS for authenticated internal users only.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- ENUMs
-- -----------------------------------------------------------------------------
CREATE TYPE inventory_status AS ENUM ('available', 'unavailable', 'in_transit');
CREATE TYPE inventory_finish_level AS ENUM ('halak', 'tuboza', 'masmesm');
CREATE TYPE inventory_piece_type AS ENUM ('panel', 'frame', 'plate');
CREATE TYPE order_status AS ENUM ('open', 'in_production', 'ready_for_delivery', 'completed', 'cancelled');
CREATE TYPE order_item_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
CREATE TYPE priority AS ENUM ('low', 'medium', 'urgent');
CREATE TYPE fulfillment_method AS ENUM ('pickup', 'shipping');
CREATE TYPE delivery_status AS ENUM ('waiting_for_pickup', 'in_transit', 'delivered', 'cancelled');
CREATE TYPE payment_status AS ENUM ('unpaid', 'paid');
CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'check', 'credit_card', 'other');

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1000 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS delivery_number_seq START WITH 1000 INCREMENT BY 1;

-- -----------------------------------------------------------------------------
-- TABLES
-- -----------------------------------------------------------------------------
CREATE TABLE public.stones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color_hex text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stones_color_hex_chk CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE UNIQUE INDEX stones_active_name_unique
  ON public.stones (name)
  WHERE is_active = true;

CREATE TRIGGER stones_set_updated_at
  BEFORE UPDATE ON public.stones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tax_id text NOT NULL,
  email text,
  phone text,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_tax_id_unique UNIQUE (tax_id)
);

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stone_id uuid NOT NULL REFERENCES public.stones(id),
  length_m numeric(10,3) NOT NULL,
  width_m numeric(10,3) NOT NULL,
  height_m numeric(10,3) NOT NULL,
  quantity_total integer NOT NULL,
  quantity_reserved integer NOT NULL DEFAULT 0,
  quantity_delivered integer NOT NULL DEFAULT 0,
  volume_m3 numeric(12,4) GENERATED ALWAYS AS (
    ROUND((length_m * width_m * height_m * quantity_total)::numeric, 4)
  ) STORED,
  price_per_m3 numeric(12,2) NOT NULL,
  customer_price numeric(12,2) NOT NULL,
  status inventory_status NOT NULL DEFAULT 'available',
  finish_level inventory_finish_level NOT NULL DEFAULT 'halak',
  piece_type inventory_piece_type NOT NULL DEFAULT 'panel',
  expected_arrival_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_dims_positive_chk CHECK (
    length_m > 0 AND width_m > 0 AND height_m > 0
  ),
  CONSTRAINT inventory_qty_total_chk CHECK (quantity_total > 0),
  CONSTRAINT inventory_qty_reserved_chk CHECK (quantity_reserved >= 0),
  CONSTRAINT inventory_qty_delivered_chk CHECK (quantity_delivered >= 0),
  CONSTRAINT inventory_qty_sum_chk CHECK (
    quantity_reserved + quantity_delivered <= quantity_total
  ),
  CONSTRAINT inventory_in_transit_arrival_chk CHECK (
    status <> 'in_transit'::inventory_status OR expected_arrival_date IS NOT NULL
  )
);

CREATE TRIGGER inventory_items_set_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX inventory_items_stone_id_idx ON public.inventory_items(stone_id);

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

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number bigint NOT NULL DEFAULT nextval('order_number_seq'),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  status order_status NOT NULL DEFAULT 'open',
  priority priority NOT NULL DEFAULT 'medium',
  supply_due_date date,
  signature_url text,
  vat_rate numeric(5,4) NOT NULL DEFAULT 0.18,
  vat_included boolean NOT NULL DEFAULT false,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_signature_url_chk CHECK (
    signature_url IS NULL OR length(signature_url) <= 2048
  )
);

ALTER SEQUENCE order_number_seq OWNED BY orders.order_number;

CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX orders_customer_id_idx ON public.orders(customer_id);
CREATE INDEX orders_status_idx ON public.orders(status);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stone_id uuid NOT NULL REFERENCES public.stones(id),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id),
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
  status order_item_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_items_dims_chk CHECK (
    length_m > 0 AND width_m > 0 AND height_m > 0
  ),
  CONSTRAINT order_items_qty_chk CHECK (quantity > 0)
);

CREATE TRIGGER order_items_set_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX order_items_order_id_idx ON public.order_items(order_id);
CREATE INDEX order_items_inventory_item_id_idx ON public.order_items(inventory_item_id);

CREATE TABLE public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_number bigint NOT NULL DEFAULT nextval('delivery_number_seq'),
  order_id uuid NOT NULL REFERENCES public.orders(id) UNIQUE,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  status delivery_status NOT NULL DEFAULT 'waiting_for_pickup',
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  payment_method payment_method,
  payment_due_date date,
  fulfillment_method fulfillment_method NOT NULL DEFAULT 'pickup',
  shipping_address text,
  delivered_at date,
  green_invoice_id text,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deliveries_shipping_address_chk CHECK (
    fulfillment_method <> 'shipping'::fulfillment_method OR (
      shipping_address IS NOT NULL AND length(trim(shipping_address)) > 0
    )
  )
);

ALTER SEQUENCE delivery_number_seq OWNED BY deliveries.delivery_number;

CREATE TRIGGER deliveries_set_updated_at
  BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX deliveries_customer_id_idx ON public.deliveries(customer_id);
CREATE INDEX deliveries_payment_status_idx ON public.deliveries(payment_status);

CREATE TABLE public.delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id),
  stone_id uuid NOT NULL REFERENCES public.stones(id),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id),
  stone_name text NOT NULL,
  color_hex text NOT NULL,
  length_m numeric(10,3) NOT NULL,
  width_m numeric(10,3) NOT NULL,
  height_m numeric(10,3) NOT NULL,
  quantity integer NOT NULL,
  volume_m3 numeric(12,4) NOT NULL,
  price_per_m3 numeric(12,2) NOT NULL,
  line_subtotal numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX delivery_items_delivery_id_idx ON public.delivery_items(delivery_id);

-- -----------------------------------------------------------------------------
-- VIEWS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.inventory_items_view AS
SELECT
  i.*,
  s.name AS stone_name,
  s.color_hex,
  (i.quantity_total - i.quantity_reserved - i.quantity_delivered) AS quantity_available
FROM public.inventory_items i
JOIN public.stones s ON s.id = i.stone_id;

CREATE OR REPLACE VIEW public.orders_view AS
SELECT
  o.*,
  c.name AS customer_name,
  c.phone AS customer_phone,
  c.email AS customer_email,
  EXISTS (SELECT 1 FROM public.deliveries d WHERE d.order_id = o.id) AS has_delivery,
  (SELECT COUNT(*)::integer FROM public.order_items oi WHERE oi.order_id = o.id) AS item_count
FROM public.orders o
JOIN public.customers c ON c.id = o.customer_id;

CREATE OR REPLACE VIEW public.order_items_view AS
SELECT
  oi.*,
  o.order_number,
  o.customer_id,
  o.priority AS order_priority,
  o.supply_due_date AS order_supply_due_date,
  o.status AS order_status,
  c.name AS customer_name,
  s.name AS stone_name,
  s.color_hex AS stone_color_hex,
  inv.volume_m3 AS inventory_shipment_volume_m3
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
JOIN public.customers c ON c.id = o.customer_id
JOIN public.stones s ON s.id = oi.stone_id
JOIN public.inventory_items inv ON inv.id = oi.inventory_item_id;

CREATE OR REPLACE VIEW public.deliveries_view AS
SELECT
  d.*,
  o.order_number,
  o.signature_url AS order_signature_url,
  c.name AS customer_name,
  c.phone AS customer_phone,
  c.email AS customer_email,
  c.tax_id AS customer_tax_id
FROM public.deliveries d
JOIN public.orders o ON o.id = d.order_id
JOIN public.customers c ON c.id = d.customer_id;

CREATE OR REPLACE VIEW public.debtors_view AS
SELECT
  d.id AS delivery_id,
  d.delivery_number,
  d.order_id,
  d.customer_id,
  d.payment_due_date,
  d.total,
  d.payment_status,
  c.name AS customer_name,
  c.phone AS customer_phone,
  c.email AS customer_email,
  o.order_number
FROM public.deliveries d
JOIN public.customers c ON c.id = d.customer_id
JOIN public.orders o ON o.id = d.order_id
WHERE d.payment_status = 'unpaid'::payment_status;

-- DROP + CREATE: Postgres rejects CREATE OR REPLACE when output column names change (42P16).
DROP VIEW IF EXISTS public.dashboard_kpis_view;
CREATE VIEW public.dashboard_kpis_view AS
SELECT
  (
    SELECT COUNT(*)::bigint
    FROM public.orders o
    WHERE o.status IN (
      'open'::order_status,
      'in_production'::order_status,
      'ready_for_delivery'::order_status
    )
  ) AS open_orders_count,
  (
    SELECT COUNT(*)::bigint
    FROM public.deliveries d
    WHERE d.payment_status = 'unpaid'::payment_status
  ) AS unpaid_deliveries_count,
  (
    SELECT COALESCE(SUM(d.total), 0)::numeric
    FROM public.deliveries d
    WHERE d.payment_status = 'unpaid'::payment_status
  ) AS receivables_total,
  (
    SELECT COALESCE(SUM(o.total), 0)::numeric
    FROM public.orders o
    WHERE (o.created_at AT TIME ZONE 'Asia/Jerusalem')::date
      >= date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jerusalem'))::date
      AND (o.created_at AT TIME ZONE 'Asia/Jerusalem')::date
      < (date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jerusalem')) + interval '1 month')::date
  ) AS monthly_revenue;

-- -----------------------------------------------------------------------------
-- RPC: create order + reserve inventory (atomic)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_create_order_with_items(
  p_customer_id uuid,
  p_priority priority,
  p_supply_due_date date,
  p_signature_url text,
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
  v_order_id uuid;
  v_elem jsonb;
  v_stone_id uuid;
  v_inv_id uuid;
  v_len numeric;
  v_wid numeric;
  v_hgt numeric;
  v_qty integer;
  v_price numeric;
  v_price_ex numeric;
  v_avail integer;
  v_subtotal numeric;
  v_factor numeric;
  inv public.inventory_items%ROWTYPE;
BEGIN
  IF p_vat_rate IS NULL OR p_vat_rate < 0 THEN
    RAISE EXCEPTION 'invalid vat_rate';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items required';
  END IF;

  v_factor := 1 + p_vat_rate;

  INSERT INTO public.orders (
    customer_id, priority, supply_due_date, signature_url,
    vat_rate, vat_included, subtotal, vat_amount, total
  ) VALUES (
    p_customer_id, p_priority, p_supply_due_date, p_signature_url,
    p_vat_rate, COALESCE(p_vat_included, false), 0, 0, 0
  )
  RETURNING id INTO v_order_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_stone_id := (v_elem->>'stone_id')::uuid;
    v_inv_id := (v_elem->>'inventory_item_id')::uuid;
    v_len := (v_elem->>'length_m')::numeric;
    v_wid := (v_elem->>'width_m')::numeric;
    v_hgt := (v_elem->>'height_m')::numeric;
    v_qty := (v_elem->>'quantity')::integer;
    v_price := (v_elem->>'price_per_m3')::numeric;

    IF v_stone_id IS NULL OR v_inv_id IS NULL OR v_qty IS NULL OR v_price IS NULL THEN
      RAISE EXCEPTION 'invalid item payload';
    END IF;

    IF v_qty <= 0 OR v_price < 0 THEN
      RAISE EXCEPTION 'invalid quantity or price';
    END IF;

    IF p_vat_included THEN
      v_price_ex := ROUND((v_price / v_factor)::numeric, 4);
    ELSE
      v_price_ex := v_price;
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
      v_len, v_wid, v_hgt, v_qty, v_price_ex
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
    vat_amount = ROUND((v_subtotal * p_vat_rate)::numeric, 2),
    total = ROUND((v_subtotal * (1 + p_vat_rate))::numeric, 2)
  WHERE id = v_order_id;

  RETURN v_order_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: delete order (+ reverse delivery inventory + drop delivery if exists)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_delete_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r record;
  v_has_delivery boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.deliveries d WHERE d.order_id = p_order_id
  )
  INTO v_has_delivery;

  IF v_has_delivery THEN
    FOR r IN
      SELECT inventory_item_id, quantity
      FROM public.order_items
      WHERE order_id = p_order_id
    LOOP
      UPDATE public.inventory_items
      SET quantity_delivered = quantity_delivered - r.quantity
      WHERE id = r.inventory_item_id;
    END LOOP;

    DELETE FROM public.deliveries WHERE order_id = p_order_id;
  ELSE
    FOR r IN
      SELECT inventory_item_id, quantity
      FROM public.order_items
      WHERE order_id = p_order_id
    LOOP
      UPDATE public.inventory_items
      SET quantity_reserved = quantity_reserved - r.quantity
      WHERE id = r.inventory_item_id;
    END LOOP;
  END IF;

  DELETE FROM public.orders WHERE id = p_order_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: delivery from order + move reserved → delivered + snapshot lines
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_create_delivery_from_order(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_delivery_id uuid;
  ord public.orders%ROWTYPE;
  oi record;
BEGIN
  SELECT id INTO v_existing FROM public.deliveries WHERE order_id = p_order_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO STRICT ord FROM public.orders WHERE id = p_order_id FOR UPDATE;

  INSERT INTO public.deliveries (
    order_id,
    customer_id,
    subtotal,
    vat_amount,
    total,
    status,
    payment_status,
    fulfillment_method
  ) VALUES (
    ord.id,
    ord.customer_id,
    ord.subtotal,
    ord.vat_amount,
    ord.total,
    'waiting_for_pickup'::delivery_status,
    'unpaid'::payment_status,
    'pickup'::fulfillment_method
  )
  RETURNING id INTO v_delivery_id;

  FOR oi IN
    SELECT
      oi2.*,
      s.name AS stone_name,
      s.color_hex
    FROM public.order_items oi2
    JOIN public.stones s ON s.id = oi2.stone_id
    WHERE oi2.order_id = p_order_id
  LOOP
    INSERT INTO public.delivery_items (
      delivery_id,
      order_item_id,
      stone_id,
      inventory_item_id,
      stone_name,
      color_hex,
      length_m,
      width_m,
      height_m,
      quantity,
      volume_m3,
      price_per_m3,
      line_subtotal
    ) VALUES (
      v_delivery_id,
      oi.id,
      oi.stone_id,
      oi.inventory_item_id,
      oi.stone_name,
      oi.color_hex,
      oi.length_m,
      oi.width_m,
      oi.height_m,
      oi.quantity,
      oi.volume_m3,
      oi.price_per_m3,
      oi.line_subtotal
    );

    UPDATE public.inventory_items
    SET
      quantity_reserved = quantity_reserved - oi.quantity,
      quantity_delivered = quantity_delivered + oi.quantity
    WHERE id = oi.inventory_item_id;
  END LOOP;

  UPDATE public.order_items
  SET status = 'completed'::order_item_status
  WHERE order_id = p_order_id;

  UPDATE public.orders
  SET status = 'ready_for_delivery'::order_status
  WHERE id = p_order_id
    AND status NOT IN ('cancelled'::order_status, 'completed'::order_status);

  RETURN v_delivery_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- RLS (authenticated internal CRM users only)
-- -----------------------------------------------------------------------------
ALTER TABLE public.stones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_stone_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY stones_authenticated_all ON public.stones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY customers_authenticated_all ON public.customers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY inventory_items_authenticated_all ON public.inventory_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY customer_stone_prices_authenticated_all ON public.customer_stone_prices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY orders_authenticated_all ON public.orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY order_items_authenticated_all ON public.order_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY deliveries_authenticated_all ON public.deliveries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY delivery_items_authenticated_all ON public.delivery_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RPC execute
GRANT EXECUTE ON FUNCTION public.crm_create_order_with_items(uuid, public.priority, date, text, numeric, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_delete_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_create_delivery_from_order(uuid) TO authenticated;

