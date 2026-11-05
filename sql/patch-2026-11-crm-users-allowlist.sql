-- =============================================================================
-- Argaman CRM — רשימת משתמשים מורשים (מומלץ מאוד)
-- =============================================================================
-- הבעיה: כל מדיניות ה-RLS היא "TO authenticated USING (true)" — כלומר כל מי
-- שמחובר רואה ועורך הכול. ב-Supabase ההרשמה (signUp) פתוחה כברירת מחדל, ומפתח
-- ה-anon נמצא בדפדפן — כך שכל אחד יכול לפתוח לעצמו משתמש ולקבל גישה מלאה.
--
-- צעד 1 (חובה, לחיצה אחת): Supabase Dashboard → Authentication → Sign In / Providers
--          → לכבות "Allow new users to sign up".
-- צעד 2 (הקובץ הזה): גם אם ההרשמה תיפתח בטעות — רק משתמשים שברשימה
--          public.crm_users יראו נתונים.
--
-- הקובץ מכניס אוטומטית לרשימה את כל המשתמשים שקיימים היום ב-auth.users.
-- להוספת עובד חדש בעתיד (אחרי שיצרתם לו משתמש ב-Authentication → Users):
--   INSERT INTO public.crm_users (user_id)
--   SELECT id FROM auth.users WHERE email = 'new.worker@example.com';
--
-- להריץ אחרי patch-2026-11-security-and-integrity.sql. בטוח להרצה חוזרת.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_users FROM anon, authenticated;

INSERT INTO public.crm_users (user_id)
SELECT id FROM auth.users
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_crm_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_users WHERE user_id = (SELECT auth.uid())
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_crm_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_crm_user() TO authenticated;

-- מחליפים את כל מדיניות ה-"USING (true)" במדיניות שבודקת את הרשימה
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'stones', 'customers', 'inventory_items', 'customer_stone_prices',
    'orders', 'order_items', 'deliveries', 'delivery_items',
    'quotes', 'quote_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_authenticated_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_crm_users_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING ((SELECT public.is_crm_user())) WITH CHECK ((SELECT public.is_crm_user()))',
      t || '_crm_users_all', t
    );
  END LOOP;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
