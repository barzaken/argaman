-- הוספת ח.פ/ת.ז לתצוגת תעודות משלוח (פרטי תעודת הזמנה במסך תעודת משלוח)
-- הערה: customer_tax_id חייב להופיע אחרי customer_email — אחרת CREATE OR REPLACE VIEW
-- מנסה "לשנות שם" לעמודה קיימת (42P16).
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
