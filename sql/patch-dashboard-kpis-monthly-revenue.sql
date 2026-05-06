-- דאשבורד: KPI "הכנסות החודש" — סכום total של תעודות הזמנה (orders) מהחודש הנוכחי.
-- סכום סך תעודות הזמנה (orders.total) בחודש הנוכחי — לפי תאריך יצירת ההזמנה
-- PostgreSQL: CREATE OR REPLACE אינו מאפשר שינוי שם עמודת פלט (42P16) — צריך DROP ואז CREATE.
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
