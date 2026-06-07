-- חשיפת יחידת תמחור ומחיר למ״ר ממלאי ב-order_items_view (לתצוגת הזמנה).

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
  inv.volume_m3 AS inventory_shipment_volume_m3,
  inv.pricing_unit AS inventory_pricing_unit,
  inv.price_per_m2 AS inventory_price_per_m2
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
JOIN public.customers c ON c.id = o.customer_id
JOIN public.stones s ON s.id = oi.stone_id
JOIN public.inventory_items inv ON inv.id = oi.inventory_item_id;
