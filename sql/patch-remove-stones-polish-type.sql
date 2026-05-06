-- הסרת polish_type (סוג ליטוש) מהמערכת.
--
-- לפני הרצה: אם שתי אבנים פעילות חולקות אותו שם ונבדלות רק בליטוש, האינדקס
-- החדש (שם ייחודי לאבן פעילה) ייכשל — יש לעדכן שמות או לאחד רשומות.

DROP VIEW IF EXISTS public.inventory_items_view;
DROP VIEW IF EXISTS public.order_items_view;

DROP INDEX IF EXISTS public.stones_active_name_polish_unique;

ALTER TABLE public.stones DROP COLUMN IF EXISTS polish_type;
ALTER TABLE public.delivery_items DROP COLUMN IF EXISTS polish_type;

CREATE UNIQUE INDEX IF NOT EXISTS stones_active_name_unique
  ON public.stones (name)
  WHERE is_active = true;

CREATE OR REPLACE VIEW public.inventory_items_view AS
SELECT
  i.*,
  s.name AS stone_name,
  s.color_hex,
  (i.quantity_total - i.quantity_reserved - i.quantity_delivered) AS quantity_available
FROM public.inventory_items i
JOIN public.stones s ON s.id = i.stone_id;

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
