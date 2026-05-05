-- -----------------------------------------------------------------------------
-- תיקון חד-פעמי / עדכון: מחיקת הזמנה גם כשכבר קיימת תעודת משלוח.
-- להריץ ב-Supabase → SQL Editor (לא צריך להריץ את כל supabase-schema.sql מחדש).
--
-- מה זה עושה:
-- • אם יש משלוח להזמנה: מחזיר כמויות ל־inventory (quantity_delivered -=),
--   מוחק את תעודת המשלוח (delivery_items נמחקות ב-CASCADE),
--   ואז מוחק את ההזמנה.
-- • אם אין משלוח: משחרר זימון כמו קודם (quantity_reserved -=) ומוחק הזמנה.
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

-- ההרשאה כבר קיימת מהסכמה המקורית; שורה זו בטוחה אם תרצה לוודא:
-- GRANT EXECUTE ON FUNCTION public.crm_delete_order(uuid) TO authenticated;
