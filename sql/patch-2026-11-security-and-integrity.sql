-- =============================================================================
-- Argaman CRM — תיקוני אבטחה ושלמות נתונים (נובמבר 2026)
-- =============================================================================
-- להריץ פעם אחת: Supabase Dashboard → SQL Editor → להדביק את כל הקובץ → Run.
-- הקובץ בטוח להרצה חוזרת (idempotent). דורש PostgreSQL 15+ (כל פרויקט Supabase עדכני).
--
-- מה זה מתקן:
--
-- 1. [קריטי] ה-Views עקפו את ה-RLS.
--    ב-Postgres, View רץ כברירת מחדל עם ההרשאות של הבעלים (postgres) ולא של
--    המשתמש המחובר. ב-Supabase התפקיד anon (המפתח הציבורי שנמצא בדפדפן) מקבל
--    SELECT על כל סכמת public — כך שכל מי שמחזיק ב-NEXT_PUBLIC_SUPABASE_ANON_KEY
--    יכול היה לקרוא את orders_view / deliveries_view / debtors_view וכו׳
--    (שמות לקוחות, טלפונים, ח.פ, סכומים וחובות) בלי להתחבר.
--    התיקון: security_invoker = true על כל ה-Views + שלילת הרשאות מ-anon.
--
-- 2. ביטול הזמנה (סטטוס "בוטלה") לא שחרר את המלאי המזומן — המלאי נשאר "תפוס"
--    לנצח. עכשיו טריגר משחרר/מזמן מחדש את הכמויות בעת שינוי סטטוס.
--    בנוסף: שחרור חד-פעמי של זימונים להזמנות שכבר מבוטלות (ללא תעודת משלוח).
--
-- 3. מחיקת הזמנה שנוצרה מהצעת מחיר נכשלה בשגיאת Foreign Key
--    (quotes.converted_order_id). עכשיו ההצעה חוזרת לסטטוס "פתוחה".
--
-- 4. מרוץ (race) ביצירת תעודת משלוח: לחיצה כפולה יכלה לנסות ליצור שתי תעודות.
--    עכשיו ההזמנה ננעלת לפני הבדיקה. כמו כן אי אפשר ליצור תעודה להזמנה מבוטלת.
--
-- 5. דאשבורד: "הכנסות החודש" כללה הזמנות מבוטלות, ותעודת משלוח מבוטלת שלא
--    שולמה נשארה ברשימת החייבים וב"יתרה לגבייה". עכשיו מבוטלים לא נספרים.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Views מתוקנים: בלי הזמנות/תעודות מבוטלות בהכנסות ובחובות
-- -----------------------------------------------------------------------------
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
WHERE d.payment_status = 'unpaid'::payment_status
  AND d.status <> 'cancelled'::delivery_status;

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
      AND d.status <> 'cancelled'::delivery_status
  ) AS unpaid_deliveries_count,
  (
    SELECT COALESCE(SUM(d.total), 0)::numeric
    FROM public.deliveries d
    WHERE d.payment_status = 'unpaid'::payment_status
      AND d.status <> 'cancelled'::delivery_status
  ) AS receivables_total,
  (
    SELECT COALESCE(SUM(o.total), 0)::numeric
    FROM public.orders o
    WHERE o.status <> 'cancelled'::order_status
      AND (o.created_at AT TIME ZONE 'Asia/Jerusalem')::date
        >= date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jerusalem'))::date
      AND (o.created_at AT TIME ZONE 'Asia/Jerusalem')::date
        < (date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jerusalem')) + interval '1 month')::date
  ) AS monthly_revenue;

-- -----------------------------------------------------------------------------
-- 1. Views → security_invoker (מכבדים RLS של המשתמש המחובר)
-- -----------------------------------------------------------------------------
ALTER VIEW IF EXISTS public.inventory_items_view SET (security_invoker = true);
ALTER VIEW IF EXISTS public.orders_view          SET (security_invoker = true);
ALTER VIEW IF EXISTS public.order_items_view     SET (security_invoker = true);
ALTER VIEW IF EXISTS public.deliveries_view      SET (security_invoker = true);
ALTER VIEW IF EXISTS public.debtors_view         SET (security_invoker = true);
ALTER VIEW IF EXISTS public.dashboard_kpis_view  SET (security_invoker = true);
ALTER VIEW IF EXISTS public.quotes_view          SET (security_invoker = true);
ALTER VIEW IF EXISTS public.quote_items_view     SET (security_invoker = true);

-- -----------------------------------------------------------------------------
-- 1b. anon (משתמש לא מחובר) לא צריך שום גישה לנתוני ה-CRM
-- -----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- גם לאובייקטים שייווצרו בעתיד
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;

-- -----------------------------------------------------------------------------
-- 2. ביטול הזמנה משחרר מלאי; החזרה מביטול מזמנת מחדש (אם יש מספיק)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orders_sync_reservation_on_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
  v_avail integer;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- אחרי שנוצרה תעודת משלוח הכמויות כבר עברו ל-delivered
  IF EXISTS (SELECT 1 FROM public.deliveries d WHERE d.order_id = NEW.id) THEN
    IF NEW.status = 'cancelled'::order_status THEN
      RAISE EXCEPTION 'cannot cancel order with delivery';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled'::order_status THEN
    FOR r IN
      SELECT inventory_item_id, SUM(quantity)::integer AS qty
      FROM public.order_items
      WHERE order_id = NEW.id
      GROUP BY inventory_item_id
    LOOP
      UPDATE public.inventory_items
      SET quantity_reserved = GREATEST(quantity_reserved - r.qty, 0)
      WHERE id = r.inventory_item_id;
    END LOOP;
  ELSIF OLD.status = 'cancelled'::order_status THEN
    FOR r IN
      SELECT inventory_item_id, SUM(quantity)::integer AS qty
      FROM public.order_items
      WHERE order_id = NEW.id
      GROUP BY inventory_item_id
    LOOP
      SELECT quantity_total - quantity_reserved - quantity_delivered
      INTO v_avail
      FROM public.inventory_items
      WHERE id = r.inventory_item_id
      FOR UPDATE;

      IF v_avail < r.qty THEN
        RAISE EXCEPTION 'insufficient quantity for inventory %', r.inventory_item_id;
      END IF;

      UPDATE public.inventory_items
      SET quantity_reserved = quantity_reserved + r.qty
      WHERE id = r.inventory_item_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_sync_reservation_on_status ON public.orders;
CREATE TRIGGER orders_sync_reservation_on_status
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_sync_reservation_on_status();

-- תיקון חד-פעמי: הזמנות שכבר בוטלו (בלי תעודת משלוח) עדיין תופסות מלאי.
-- מסמנים אותן כדי שלא נשחרר פעמיים בהרצה חוזרת של הקובץ.
CREATE TABLE IF NOT EXISTS public._migration_released_cancelled_orders (
  order_id uuid PRIMARY KEY
);
ALTER TABLE public._migration_released_cancelled_orders ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT oi.inventory_item_id, SUM(oi.quantity)::integer AS qty
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.status = 'cancelled'::order_status
      AND NOT EXISTS (SELECT 1 FROM public.deliveries d WHERE d.order_id = o.id)
      AND NOT EXISTS (
        SELECT 1 FROM public._migration_released_cancelled_orders m
        WHERE m.order_id = o.id
      )
    GROUP BY oi.inventory_item_id
  LOOP
    UPDATE public.inventory_items
    SET quantity_reserved = GREATEST(quantity_reserved - r.qty, 0)
    WHERE id = r.inventory_item_id;
  END LOOP;

  INSERT INTO public._migration_released_cancelled_orders (order_id)
  SELECT o.id
  FROM public.orders o
  WHERE o.status = 'cancelled'::order_status
    AND NOT EXISTS (SELECT 1 FROM public.deliveries d WHERE d.order_id = o.id)
  ON CONFLICT DO NOTHING;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. מחיקת הזמנה: נעילה, התחשבות בהזמנה מבוטלת, ושחרור הצעת מחיר מקושרת
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_delete_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r record;
  ord public.orders%ROWTYPE;
  v_has_delivery boolean;
BEGIN
  SELECT * INTO ord FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;

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
      SET quantity_delivered = GREATEST(quantity_delivered - r.quantity, 0)
      WHERE id = r.inventory_item_id;
    END LOOP;

    DELETE FROM public.deliveries WHERE order_id = p_order_id;
  ELSIF ord.status <> 'cancelled'::order_status THEN
    -- הזמנה מבוטלת כבר שחררה את הזימון (טריגר סטטוס)
    FOR r IN
      SELECT inventory_item_id, quantity
      FROM public.order_items
      WHERE order_id = p_order_id
    LOOP
      UPDATE public.inventory_items
      SET quantity_reserved = GREATEST(quantity_reserved - r.quantity, 0)
      WHERE id = r.inventory_item_id;
    END LOOP;
  END IF;

  -- הצעת מחיר שהומרה להזמנה הזו חוזרת להיות פתוחה (אחרת FK חוסם את המחיקה)
  IF to_regclass('public.quotes') IS NOT NULL THEN
    EXECUTE
      'UPDATE public.quotes
         SET status = ''open''::public.quote_status, converted_order_id = NULL
       WHERE converted_order_id = $1'
    USING p_order_id;
  END IF;

  DELETE FROM public.orders WHERE id = p_order_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. יצירת תעודת משלוח: נעילה לפני בדיקת קיום + חסימת הזמנה מבוטלת
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
  SELECT * INTO STRICT ord FROM public.orders WHERE id = p_order_id FOR UPDATE;

  SELECT id INTO v_existing FROM public.deliveries WHERE order_id = p_order_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF ord.status = 'cancelled'::order_status THEN
    RAISE EXCEPTION 'cannot create delivery for cancelled order';
  END IF;

  INSERT INTO public.deliveries (
    order_id, customer_id, subtotal, vat_amount, total,
    status, payment_status, fulfillment_method
  ) VALUES (
    ord.id, ord.customer_id, ord.subtotal, ord.vat_amount, ord.total,
    'waiting_for_pickup'::delivery_status,
    'unpaid'::payment_status,
    'pickup'::fulfillment_method
  )
  RETURNING id INTO v_delivery_id;

  FOR oi IN
    SELECT oi2.*, s.name AS stone_name, s.color_hex
    FROM public.order_items oi2
    JOIN public.stones s ON s.id = oi2.stone_id
    WHERE oi2.order_id = p_order_id
  LOOP
    INSERT INTO public.delivery_items (
      delivery_id, order_item_id, stone_id, inventory_item_id,
      stone_name, color_hex, length_m, width_m, height_m,
      quantity, volume_m3, price_per_m3, line_subtotal
    ) VALUES (
      v_delivery_id, oi.id, oi.stone_id, oi.inventory_item_id,
      oi.stone_name, oi.color_hex, oi.length_m, oi.width_m, oi.height_m,
      oi.quantity, oi.volume_m3, oi.price_per_m3, oi.line_subtotal
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

GRANT EXECUTE ON FUNCTION public.crm_delete_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_create_delivery_from_order(uuid) TO authenticated;

COMMIT;

-- רענון ה-schema cache של PostgREST
NOTIFY pgrst, 'reload schema';
