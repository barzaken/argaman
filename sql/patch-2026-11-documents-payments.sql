-- =============================================================================
-- Argaman CRM — מסמכים, תשלומים, ספקים, הוצאות, הרשאות ויומן פעולות (נובמבר 2026)
-- =============================================================================
-- להריץ פעם אחת: Supabase Dashboard → SQL Editor → להדביק את כל הקובץ → Run.
-- הקובץ בטוח להרצה חוזרת (idempotent). להריץ אחרי:
--   patch-2026-11-security-and-integrity.sql
--   patch-2026-11-crm-users-allowlist.sql
--
-- מה הקובץ מוסיף:
--
-- 1. תפקידים (crm_users.role): 'admin' (מנהל — ברירת מחדל לכל המשתמשים
--    הקיימים) או 'agent' (סוכן / בוט ה-AI שמפעיל את המערכת דרך וואטסאפ).
--    סוכן יכול לצפות, להוסיף ולערוך — אבל לא למחוק שום דבר.
--    כל מדיניות "<טבלה>_crm_users_all" מוחלפת בארבע מדיניות נפרדות:
--    SELECT / INSERT / UPDATE לכל משתמש מורשה, DELETE למנהל בלבד.
--    חריגים מכוונים (עריכה, לא מחיקה): שורות של הצעת מחיר פתוחה (עריכת הצעה
--    מחליפה את השורות), חיובים נוספים בהזמנה, ושורת מלאי שנוצרה בדקות
--    האחרונות ולא נעשה בה שימוש (ביטול אוטומטי כשיצירת הזמנה נכשלת).
--    להפיכת משתמש לסוכן:
--      UPDATE public.crm_users SET role = 'agent', display_name = 'בוט וואטסאפ'
--      WHERE user_id = (SELECT id FROM auth.users WHERE email = 'bot@example.com');
--
-- 2. ספקים (suppliers) — כולל מזהה ספק ב-Green Invoice (חשבונית ירוקה / Morning).
--
-- 3. קטלוג אבן: מק״ט (sku) ושמות חלופיים (aliases) — השמות שספקים ולקוחות
--    כותבים על מסמכים, כדי שהסוכן יזהה את האבן הנכונה.
--
-- 4. מלאי: ספק ומסמך מקור (חשבונית / תעודת משלוח של הספק) לכל שורת מלאי.
--
-- 5. ארכיון מסמכים (documents): כל מסמך הנהלת חשבונות — קבלות וחשבוניות
--    שהפקנו, חשבוניות ותעודות משלוח של ספקים, קבלות על הוצאות, תעודות משלוח
--    חתומות. מסמך שנכנס מתמונה נכנס בסטטוס "ממתין לבדיקה". הגנה מכפילות:
--    אותו סוג + אותו ח.פ + אותו מספר מסמך לא ייכנסו פעמיים.
--
-- 6. תשלומים מלקוחות (payments + payment_allocations): תשלום אחד יכול לכסות
--    כמה תעודות משלוח, ותעודה יכולה להיות משולמת בכמה תשלומים (תשלום חלקי).
--    הסכום ששולם וסטטוס התשלום של תעודת המשלוח מחושבים אוטומטית.
--    תעודות שסומנו "שולם" לפני הקובץ הזה נרשמות כ"שולם מחוץ למערכת התשלומים".
--    רשימת החייבים והדאשבורד מציגים יתרה (סכום פחות מה ששולם).
--
-- 7. הוצאות (expenses) לפי קטגוריות, כולל שדות לסנכרון עם Green Invoice.
--
-- 8. חיובים נוספים בהזמנה (order_charges): הובלה, עיבוד, שירות, הנחה.
--    סכומי ההזמנה מחושבים מחדש אוטומטית. אחרי הפקת תעודת משלוח — נעול.
--
-- 9. הזמנות: תאריך מסמך (document_date) והערות. "הכנסות החודש" לפי תאריך המסמך.
--
-- 10. יומן פעולות (activity_log): מי שינה מה ומתי, בכל הטבלאות העיקריות.
--
-- 11. Views מעודכנים (עם העמודות החדשות), כולם security_invoker.
--
-- 12. Supabase Storage: דלי פרטי 'documents' לקבצי המסמכים (עד 20MB,
--     תמונות ו-PDF). מחיקת קבצים — למנהל בלבד.
-- =============================================================================

BEGIN;

-- תאריך "היום" לפי שעון ישראל (ברירת מחדל לשדות תאריך)
CREATE OR REPLACE FUNCTION public.crm_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Jerusalem')::date;
$$;

-- =============================================================================
-- 1. תפקידים: admin / agent
-- =============================================================================
ALTER TABLE public.crm_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin';
ALTER TABLE public.crm_users ADD COLUMN IF NOT EXISTS display_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_users_role_chk'
  ) THEN
    ALTER TABLE public.crm_users
      ADD CONSTRAINT crm_users_role_chk CHECK (role IN ('admin', 'agent'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.crm_users WHERE user_id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_crm_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_users
    WHERE user_id = (SELECT auth.uid()) AND role = 'admin'
  );
$$;

-- רשימת משתמשי ה-CRM (למסך הגדרות). מנהל רואה את כולם, סוכן רק את עצמו.
CREATE OR REPLACE FUNCTION public.crm_list_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  role text,
  display_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cu.user_id, u.email::text, cu.role, cu.display_name, cu.created_at
  FROM public.crm_users cu
  LEFT JOIN auth.users u ON u.id = cu.user_id
  WHERE public.is_crm_admin() OR cu.user_id = (SELECT auth.uid())
  ORDER BY cu.created_at;
$$;

-- שינוי תפקיד / שם תצוגה (מנהל בלבד; אי אפשר להוריד את המנהל האחרון)
CREATE OR REPLACE FUNCTION public.crm_set_user_role(
  p_user_id uuid,
  p_role text,
  p_display_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_crm_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF p_role NOT IN ('admin', 'agent') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;
  IF p_role = 'agent' AND NOT EXISTS (
    SELECT 1 FROM public.crm_users
    WHERE role = 'admin' AND user_id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'last admin';
  END IF;

  UPDATE public.crm_users
  SET role = p_role,
      display_name = COALESCE(NULLIF(TRIM(p_display_name), ''), display_name)
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_user_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_crm_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crm_list_users() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crm_set_user_role(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_crm_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_set_user_role(uuid, text, text) TO authenticated;

-- מחיקת הזמנה / הצעת מחיר — מנהל בלבד
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
  IF NOT public.is_crm_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

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

CREATE OR REPLACE FUNCTION public.crm_delete_quote(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_status public.quote_status;
BEGIN
  IF NOT public.is_crm_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

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

-- =============================================================================
-- 2. ספקים
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tax_id text,
  email text,
  phone text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  green_invoice_supplier_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_name_chk CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_tax_id_unique
  ON public.suppliers (tax_id) WHERE tax_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS suppliers_name_idx ON public.suppliers (name);

DROP TRIGGER IF EXISTS suppliers_set_updated_at ON public.suppliers;
CREATE TRIGGER suppliers_set_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 3. קטלוג אבן: מק״ט + שמות חלופיים
-- =============================================================================
ALTER TABLE public.stones ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.stones ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS stones_sku_unique
  ON public.stones (sku) WHERE sku IS NOT NULL;

-- =============================================================================
-- 4. מלאי: ספק + מסמך מקור (ה-FK למסמך נוסף אחרי יצירת documents)
-- =============================================================================
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS source_document_id uuid;
CREATE INDEX IF NOT EXISTS inventory_items_supplier_id_idx ON public.inventory_items (supplier_id);

-- =============================================================================
-- 5. ארכיון מסמכים
-- =============================================================================
DO $$
BEGIN
  CREATE TYPE public.document_kind AS ENUM (
    'customer_invoice',
    'customer_invoice_receipt',
    'customer_receipt',
    'customer_credit_note',
    'supplier_invoice',
    'supplier_receipt',
    'supplier_delivery_note',
    'expense_receipt',
    'signed_delivery_note',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TYPE public.document_status AS ENUM ('pending_review', 'processed', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.document_kind NOT NULL DEFAULT 'other',
  status public.document_status NOT NULL DEFAULT 'pending_review',
  storage_path text,
  file_name text,
  mime_type text,
  file_size bigint,
  document_number text,
  document_date date,
  due_date date,
  currency text NOT NULL DEFAULT 'ILS',
  amount_before_vat numeric(12,2),
  vat_amount numeric(12,2),
  amount_total numeric(12,2),
  counterparty_name text,
  counterparty_tax_id text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  delivery_id uuid REFERENCES public.deliveries(id) ON DELETE SET NULL,
  payment_id uuid,
  expense_id uuid,
  green_invoice_id text,
  green_invoice_type integer,
  green_invoice_url text,
  source text NOT NULL DEFAULT 'upload',
  notes text,
  extracted jsonb,
  uploaded_by uuid DEFAULT auth.uid(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_source_chk CHECK (source IN ('upload', 'whatsapp', 'green_invoice', 'system')),
  CONSTRAINT documents_file_size_chk CHECK (file_size IS NULL OR file_size >= 0),
  CONSTRAINT documents_currency_chk CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS documents_duplicate_unique
  ON public.documents (kind, COALESCE(counterparty_tax_id, ''), document_number)
  WHERE document_number IS NOT NULL AND status <> 'rejected'::public.document_status;
CREATE INDEX IF NOT EXISTS documents_customer_id_idx ON public.documents (customer_id);
CREATE INDEX IF NOT EXISTS documents_supplier_id_idx ON public.documents (supplier_id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON public.documents (status);
CREATE INDEX IF NOT EXISTS documents_document_date_idx ON public.documents (document_date);
CREATE INDEX IF NOT EXISTS documents_order_id_idx ON public.documents (order_id);
CREATE INDEX IF NOT EXISTS documents_delivery_id_idx ON public.documents (delivery_id);

DROP TRIGGER IF EXISTS documents_set_updated_at ON public.documents;
CREATE TRIGGER documents_set_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_source_document_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_source_document_id_fkey
      FOREIGN KEY (source_document_id) REFERENCES public.documents(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- =============================================================================
-- 6. תשלומים מלקוחות
-- =============================================================================
CREATE SEQUENCE IF NOT EXISTS public.payment_number_seq START WITH 1000 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number bigint NOT NULL DEFAULT nextval('public.payment_number_seq'),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  amount numeric(12,2) NOT NULL,
  paid_at date NOT NULL DEFAULT public.crm_today(),
  method public.payment_method NOT NULL,
  reference text,
  bank_name text,
  notes text,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  green_invoice_receipt_id text,
  green_invoice_receipt_number text,
  green_invoice_url text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_chk CHECK (amount > 0),
  CONSTRAINT payments_payment_number_key UNIQUE (payment_number)
);

ALTER SEQUENCE public.payment_number_seq OWNED BY public.payments.payment_number;

CREATE INDEX IF NOT EXISTS payments_customer_id_idx ON public.payments (customer_id);
CREATE INDEX IF NOT EXISTS payments_paid_at_idx ON public.payments (paid_at);

DROP TRIGGER IF EXISTS payments_set_updated_at ON public.payments;
CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_allocations_amount_chk CHECK (amount > 0),
  CONSTRAINT payment_allocations_unique UNIQUE (payment_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS payment_allocations_delivery_id_idx
  ON public.payment_allocations (delivery_id);

DROP TRIGGER IF EXISTS payment_allocations_set_updated_at ON public.payment_allocations;
CREATE TRIGGER payment_allocations_set_updated_at
  BEFORE UPDATE ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_payment_id_fkey') THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_payment_id_fkey
      FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS documents_payment_id_idx ON public.documents (payment_id);

-- תעודות משלוח: סכום ששולם, תשלום מחוץ למערכת, תאריך תשלום, הערות
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS paid_outside_payments numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS paid_at date;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deliveries_paid_outside_payments_chk'
  ) THEN
    ALTER TABLE public.deliveries
      ADD CONSTRAINT deliveries_paid_outside_payments_chk CHECK (paid_outside_payments >= 0);
  END IF;
END;
$$;

-- גיבוי חד-פעמי: תעודות שכבר סומנו "שולם" → שולמו מחוץ למערכת התשלומים.
-- (רץ לפני יצירת הטריגר; בהרצה חוזרת התנאי לא תופס שום שורה)
UPDATE public.deliveries d
SET paid_outside_payments = d.total,
    amount_paid = d.total
WHERE d.payment_status = 'paid'::payment_status
  AND d.paid_outside_payments = 0
  AND d.total > 0
  AND NOT EXISTS (SELECT 1 FROM public.payment_allocations a WHERE a.delivery_id = d.id);

-- מקור אמת יחיד לסטטוס התשלום של תעודת משלוח:
--   amount_paid    = סכום ההקצאות + paid_outside_payments
--   payment_status = paid כאשר amount_paid >= total (סובלנות 0.005)
--   paid_at        = תאריך התשלום האחרון שהוקצה (או null)
-- שינוי ידני של payment_status (טופס העריכה הישן) מתורגם ל-paid_outside_payments.
CREATE OR REPLACE FUNCTION public.deliveries_derive_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_alloc numeric(12,2);
  v_last date;
BEGIN
  SELECT COALESCE(SUM(a.amount), 0), MAX(p.paid_at)
  INTO v_alloc, v_last
  FROM public.payment_allocations a
  JOIN public.payments p ON p.id = a.payment_id
  WHERE a.delivery_id = NEW.id;

  IF TG_OP = 'UPDATE' AND NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF NEW.payment_status = 'paid'::payment_status THEN
      NEW.paid_outside_payments := GREATEST(NEW.total - v_alloc, 0);
      IF v_last IS NULL THEN
        NEW.paid_at := COALESCE(NEW.paid_at, public.crm_today());
      END IF;
    ELSE
      IF v_alloc >= NEW.total - 0.005 AND NEW.total > 0 THEN
        RAISE EXCEPTION 'delivery is covered by payments';
      END IF;
      NEW.paid_outside_payments := 0;
    END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.payment_status = 'paid'::payment_status
        AND NEW.paid_outside_payments = 0 THEN
    NEW.paid_outside_payments := GREATEST(NEW.total, 0);
  END IF;

  NEW.amount_paid := v_alloc + NEW.paid_outside_payments;
  NEW.payment_status := CASE
    WHEN NEW.amount_paid >= NEW.total - 0.005 THEN 'paid'::payment_status
    ELSE 'unpaid'::payment_status
  END;

  IF v_last IS NOT NULL THEN
    NEW.paid_at := v_last;
  ELSIF NEW.paid_outside_payments <= 0 THEN
    NEW.paid_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deliveries_derive_payment ON public.deliveries;
CREATE TRIGGER deliveries_derive_payment
  BEFORE INSERT OR UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.deliveries_derive_payment();

-- כל שינוי בהקצאות "נוגע" בתעודת המשלוח כדי שהטריגר למעלה יחשב מחדש
CREATE OR REPLACE FUNCTION public.payment_allocations_touch_delivery()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE public.deliveries SET amount_paid = amount_paid WHERE id = OLD.delivery_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF TG_OP = 'INSERT' OR NEW.delivery_id IS DISTINCT FROM OLD.delivery_id
       OR NEW.amount IS DISTINCT FROM OLD.amount THEN
      UPDATE public.deliveries SET amount_paid = amount_paid WHERE id = NEW.delivery_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS payment_allocations_touch_delivery ON public.payment_allocations;
CREATE TRIGGER payment_allocations_touch_delivery
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.payment_allocations_touch_delivery();

CREATE OR REPLACE FUNCTION public.payments_touch_deliveries()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
    UPDATE public.deliveries d
    SET amount_paid = d.amount_paid
    WHERE d.id IN (
      SELECT a.delivery_id FROM public.payment_allocations a WHERE a.payment_id = NEW.id
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS payments_touch_deliveries ON public.payments;
CREATE TRIGGER payments_touch_deliveries
  AFTER UPDATE OF paid_at ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_touch_deliveries();

-- בדיקות שלמות להקצאה:
--   * סכום ההקצאות של תשלום ≤ סכום התשלום
--   * התעודה שייכת לאותו לקוח של התשלום
--   * לא מקצים יותר מיתרת התעודה, ולא לתעודה מבוטלת
CREATE OR REPLACE FUNCTION public.payment_allocations_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  p public.payments%ROWTYPE;
  d public.deliveries%ROWTYPE;
  v_sum numeric;
BEGIN
  -- השורה אולי כבר נמחקה (בדיקה דחויה)
  IF NOT EXISTS (SELECT 1 FROM public.payment_allocations WHERE id = NEW.id) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO p FROM public.payments WHERE id = NEW.payment_id;
  SELECT * INTO d FROM public.deliveries WHERE id = NEW.delivery_id;

  IF d.customer_id IS DISTINCT FROM p.customer_id THEN
    RAISE EXCEPTION 'allocation customer mismatch';
  END IF;

  IF d.status = 'cancelled'::delivery_status
     AND (TG_OP = 'INSERT' OR NEW.amount > OLD.amount OR NEW.delivery_id IS DISTINCT FROM OLD.delivery_id) THEN
    RAISE EXCEPTION 'cannot allocate to cancelled delivery';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_sum
  FROM public.payment_allocations WHERE payment_id = NEW.payment_id;
  IF v_sum > p.amount + 0.005 THEN
    RAISE EXCEPTION 'payment over-allocated';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_sum
  FROM public.payment_allocations WHERE delivery_id = NEW.delivery_id;
  IF v_sum + d.paid_outside_payments > d.total + 0.005 THEN
    RAISE EXCEPTION 'delivery over-allocated';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS payment_allocations_check ON public.payment_allocations;
CREATE CONSTRAINT TRIGGER payment_allocations_check
  AFTER INSERT OR UPDATE ON public.payment_allocations
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION public.payment_allocations_check();

CREATE OR REPLACE FUNCTION public.payments_check_allocations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id AND EXISTS (
    SELECT 1
    FROM public.payment_allocations a
    JOIN public.deliveries d ON d.id = a.delivery_id
    WHERE a.payment_id = NEW.id AND d.customer_id <> NEW.customer_id
  ) THEN
    RAISE EXCEPTION 'allocation customer mismatch';
  END IF;

  IF (SELECT COALESCE(SUM(amount), 0) FROM public.payment_allocations WHERE payment_id = NEW.id)
     > NEW.amount + 0.005 THEN
    RAISE EXCEPTION 'payment over-allocated';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS payments_check_allocations ON public.payments;
CREATE CONSTRAINT TRIGGER payments_check_allocations
  AFTER UPDATE OF amount, customer_id ON public.payments
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION public.payments_check_allocations();

-- RPC: רישום תשלום + הקצאה לתעודות משלוח (אטומי)
--   p_allocations: [{"delivery_id": "...", "amount": 123.45}, ...] (אפשר ריק)
--   p_document_id: מסמך (קבלה / צילום צ׳ק) לקשר לתשלום — המסמך מסומן "טופל"
CREATE OR REPLACE FUNCTION public.crm_record_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_paid_at date DEFAULT NULL,
  p_method public.payment_method DEFAULT 'other',
  p_reference text DEFAULT NULL,
  p_bank_name text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_document_id uuid DEFAULT NULL,
  p_allocations jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_elem jsonb;
  v_delivery_id uuid;
  v_amount numeric;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid payment amount';
  END IF;
  IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'invalid allocations payload';
  END IF;

  INSERT INTO public.payments (
    customer_id, amount, paid_at, method, reference, bank_name, notes, document_id
  ) VALUES (
    p_customer_id,
    ROUND(p_amount, 2),
    COALESCE(p_paid_at, public.crm_today()),
    COALESCE(p_method, 'other'::public.payment_method),
    NULLIF(TRIM(p_reference), ''),
    NULLIF(TRIM(p_bank_name), ''),
    NULLIF(TRIM(p_notes), ''),
    p_document_id
  )
  RETURNING id INTO v_payment_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb))
  LOOP
    v_delivery_id := (v_elem->>'delivery_id')::uuid;
    v_amount := ROUND((v_elem->>'amount')::numeric, 2);
    IF v_delivery_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'invalid allocations payload';
    END IF;

    -- נעילה כדי ששני תשלומים במקביל לא יעברו את יתרת התעודה
    PERFORM 1 FROM public.deliveries WHERE id = v_delivery_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'delivery not found';
    END IF;

    INSERT INTO public.payment_allocations (payment_id, delivery_id, amount)
    VALUES (v_payment_id, v_delivery_id, v_amount)
    ON CONFLICT (payment_id, delivery_id)
    DO UPDATE SET amount = public.payment_allocations.amount + EXCLUDED.amount;
  END LOOP;

  IF p_document_id IS NOT NULL THEN
    UPDATE public.documents
    SET payment_id = v_payment_id,
        customer_id = COALESCE(customer_id, p_customer_id),
        status = CASE WHEN status = 'pending_review'::public.document_status
                      THEN 'processed'::public.document_status ELSE status END,
        reviewed_by = CASE WHEN status = 'pending_review'::public.document_status
                           THEN auth.uid() ELSE reviewed_by END,
        reviewed_at = CASE WHEN status = 'pending_review'::public.document_status
                           THEN now() ELSE reviewed_at END
    WHERE id = p_document_id;
  END IF;

  RETURN v_payment_id;
END;
$$;

-- RPC: "סמן כשולם" — יוצר תשלום על יתרת התעודה ומקצה אותו אליה.
-- מחזיר את מזהה התשלום, או NULL אם התעודה כבר שולמה במלואה.
CREATE OR REPLACE FUNCTION public.crm_mark_delivery_paid(
  p_delivery_id uuid,
  p_method public.payment_method DEFAULT NULL,
  p_paid_at date DEFAULT NULL,
  p_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  d public.deliveries%ROWTYPE;
  v_remaining numeric(12,2);
  v_method public.payment_method;
BEGIN
  SELECT * INTO d FROM public.deliveries WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery not found';
  END IF;
  IF d.status = 'cancelled'::delivery_status THEN
    RAISE EXCEPTION 'cannot allocate to cancelled delivery';
  END IF;

  v_remaining := d.total - d.amount_paid;
  IF v_remaining <= 0.005 THEN
    RETURN NULL;
  END IF;

  v_method := COALESCE(p_method, d.payment_method, 'other'::public.payment_method);

  IF d.payment_method IS NULL THEN
    UPDATE public.deliveries SET payment_method = v_method WHERE id = p_delivery_id;
  END IF;

  RETURN public.crm_record_payment(
    p_customer_id => d.customer_id,
    p_amount => v_remaining,
    p_paid_at => p_paid_at,
    p_method => v_method,
    p_reference => p_reference,
    p_bank_name => NULL,
    p_notes => NULL,
    p_document_id => NULL,
    p_allocations => jsonb_build_array(
      jsonb_build_object('delivery_id', p_delivery_id, 'amount', v_remaining)
    )
  );
END;
$$;

-- =============================================================================
-- 7. הוצאות
-- =============================================================================
DO $$
BEGIN
  CREATE TYPE public.expense_category AS ENUM (
    'stone_purchase',
    'transport',
    'fuel',
    'vehicle',
    'maintenance',
    'rent',
    'salaries',
    'office',
    'tools',
    'professional_services',
    'taxes_fees',
    'marketing',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  category public.expense_category NOT NULL DEFAULT 'other',
  description text,
  expense_date date NOT NULL,
  reporting_month date,
  document_number text,
  document_type integer NOT NULL DEFAULT 305,
  amount_before_vat numeric(12,2),
  vat_amount numeric(12,2),
  amount_total numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ILS',
  is_paid boolean NOT NULL DEFAULT false,
  paid_at date,
  payment_method public.payment_method,
  green_invoice_expense_id text,
  green_invoice_status integer,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_amount_total_chk CHECK (amount_total >= 0),
  CONSTRAINT expenses_document_type_chk CHECK (document_type IN (20, 305, 320, 330, 400, 405)),
  CONSTRAINT expenses_reporting_month_chk CHECK (
    reporting_month IS NULL OR EXTRACT(DAY FROM reporting_month) = 1
  ),
  CONSTRAINT expenses_currency_chk CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS expenses_supplier_document_unique
  ON public.expenses (supplier_id, document_number)
  WHERE supplier_id IS NOT NULL AND document_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS expenses_expense_date_idx ON public.expenses (expense_date);
CREATE INDEX IF NOT EXISTS expenses_category_idx ON public.expenses (category);
CREATE INDEX IF NOT EXISTS expenses_supplier_id_idx ON public.expenses (supplier_id);

DROP TRIGGER IF EXISTS expenses_set_updated_at ON public.expenses;
CREATE TRIGGER expenses_set_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_expense_id_fkey') THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_expense_id_fkey
      FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE SET NULL;
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS documents_expense_id_idx ON public.documents (expense_id);

-- =============================================================================
-- 8. חיובים נוספים בהזמנה
-- =============================================================================
DO $$
BEGIN
  CREATE TYPE public.order_charge_kind AS ENUM ('shipping', 'processing', 'service', 'discount', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.order_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kind public.order_charge_kind NOT NULL DEFAULT 'other',
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_charges_amount_sign_chk CHECK (
    (kind = 'discount'::public.order_charge_kind AND amount <= 0)
    OR (kind <> 'discount'::public.order_charge_kind AND amount >= 0)
  ),
  CONSTRAINT order_charges_description_chk CHECK (length(trim(description)) > 0)
);

CREATE INDEX IF NOT EXISTS order_charges_order_id_idx ON public.order_charges (order_id);

DROP TRIGGER IF EXISTS order_charges_set_updated_at ON public.order_charges;
CREATE TRIGGER order_charges_set_updated_at
  BEFORE UPDATE ON public.order_charges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- סכומי הזמנה = שורות + חיובים נוספים (לפני מע״מ), מע״מ לפי orders.vat_rate
CREATE OR REPLACE FUNCTION public.crm_recalc_order_totals(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_rate numeric;
  v_subtotal numeric;
BEGIN
  SELECT vat_rate INTO v_rate FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_subtotal :=
    COALESCE((SELECT SUM(line_subtotal) FROM public.order_items WHERE order_id = p_order_id), 0)
    + COALESCE((SELECT SUM(amount) FROM public.order_charges WHERE order_id = p_order_id), 0);

  IF v_subtotal < 0 THEN
    RAISE EXCEPTION 'order total cannot be negative';
  END IF;

  UPDATE public.orders
  SET subtotal = ROUND(v_subtotal, 2),
      vat_amount = ROUND((v_subtotal * v_rate)::numeric, 2),
      total = ROUND((v_subtotal * (1 + v_rate))::numeric, 2)
  WHERE id = p_order_id;
END;
$$;

-- אחרי שהופקה תעודת משלוח הסכומים "קפואים" בתעודה — אין לשנות חיובים
CREATE OR REPLACE FUNCTION public.order_charges_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND EXISTS (
    SELECT 1 FROM public.deliveries WHERE order_id = OLD.order_id
  ) THEN
    RAISE EXCEPTION 'order has delivery';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND EXISTS (
    SELECT 1 FROM public.deliveries WHERE order_id = NEW.order_id
  ) THEN
    RAISE EXCEPTION 'order has delivery';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_charges_guard ON public.order_charges;
CREATE TRIGGER order_charges_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.order_charges
  FOR EACH ROW EXECUTE FUNCTION public.order_charges_guard();

CREATE OR REPLACE FUNCTION public.order_charges_recalc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.crm_recalc_order_totals(OLD.order_id);
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id) THEN
    PERFORM public.crm_recalc_order_totals(NEW.order_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS order_charges_recalc ON public.order_charges;
CREATE TRIGGER order_charges_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.order_charges
  FOR EACH ROW EXECUTE FUNCTION public.order_charges_recalc();

-- =============================================================================
-- 9. הזמנות: תאריך מסמך + הערות
-- =============================================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS document_date date;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes text;
UPDATE public.orders
SET document_date = (created_at AT TIME ZONE 'Asia/Jerusalem')::date
WHERE document_date IS NULL;
ALTER TABLE public.orders ALTER COLUMN document_date SET DEFAULT public.crm_today();
ALTER TABLE public.orders ALTER COLUMN document_date SET NOT NULL;
CREATE INDEX IF NOT EXISTS orders_document_date_idx ON public.orders (document_date);

-- =============================================================================
-- 10. יומן פעולות
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.activity_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id uuid DEFAULT auth.uid(),
  user_email text,
  user_role text,
  action text NOT NULL,
  table_name text NOT NULL,
  row_id uuid,
  changes jsonb,
  CONSTRAINT activity_log_action_chk CHECK (action IN ('insert', 'update', 'delete'))
);

CREATE INDEX IF NOT EXISTS activity_log_at_idx ON public.activity_log (at DESC);
CREATE INDEX IF NOT EXISTS activity_log_row_idx ON public.activity_log (table_name, row_id);
CREATE INDEX IF NOT EXISTS activity_log_user_idx ON public.activity_log (user_id);

CREATE OR REPLACE FUNCTION public.crm_activity_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_role text;
  v_old jsonb;
  v_new jsonb;
  v_changes jsonb;
  v_row jsonb;
BEGIN
  v_uid := auth.uid();

  BEGIN
    v_email := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'email';
  EXCEPTION WHEN others THEN
    v_email := NULL;
  END;
  IF v_email IS NULL AND v_uid IS NOT NULL THEN
    SELECT u.email::text INTO v_email FROM auth.users u WHERE u.id = v_uid;
  END IF;
  IF v_uid IS NOT NULL THEN
    SELECT cu.role INTO v_role FROM public.crm_users cu WHERE cu.user_id = v_uid;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    SELECT jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value))
    INTO v_changes
    FROM jsonb_each(v_new) n
    JOIN jsonb_each(v_old) o ON o.key = n.key
    WHERE n.value IS DISTINCT FROM o.value
      AND n.key NOT IN ('updated_at');

    IF v_changes IS NULL THEN
      RETURN NULL; -- שום עמודה לא השתנתה בפועל
    END IF;
    v_row := v_new;
  ELSIF TG_OP = 'INSERT' THEN
    v_row := to_jsonb(NEW);
    v_changes := v_row - 'updated_at';
  ELSE
    v_row := to_jsonb(OLD);
    v_changes := v_row - 'updated_at';
  END IF;

  INSERT INTO public.activity_log (user_id, user_email, user_role, action, table_name, row_id, changes)
  VALUES (
    v_uid,
    v_email,
    v_role,
    lower(TG_OP),
    TG_TABLE_NAME,
    NULLIF(v_row->>'id', '')::uuid,
    v_changes
  );

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_activity_log_trigger() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'stones', 'customers', 'customer_stone_prices', 'suppliers', 'inventory_items',
    'orders', 'order_items', 'order_charges', 'deliveries', 'quotes', 'quote_items',
    'documents', 'payments', 'payment_allocations', 'expenses'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS crm_activity_log ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER crm_activity_log AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.crm_activity_log_trigger()',
      t
    );
  END LOOP;
END;
$$;

-- =============================================================================
-- 11. Views (DROP + CREATE כי x.* "קופא" את רשימת העמודות ביצירה)
-- =============================================================================
DROP VIEW IF EXISTS public.inventory_items_view;
CREATE VIEW public.inventory_items_view AS
SELECT
  i.*,
  s.name AS stone_name,
  s.color_hex,
  (i.quantity_total - i.quantity_reserved - i.quantity_delivered) AS quantity_available,
  sup.name AS supplier_name
FROM public.inventory_items i
JOIN public.stones s ON s.id = i.stone_id
LEFT JOIN public.suppliers sup ON sup.id = i.supplier_id;

DROP VIEW IF EXISTS public.orders_view;
CREATE VIEW public.orders_view AS
SELECT
  o.*,
  c.name AS customer_name,
  c.phone AS customer_phone,
  c.email AS customer_email,
  EXISTS (SELECT 1 FROM public.deliveries d WHERE d.order_id = o.id) AS has_delivery,
  (SELECT COUNT(*)::integer FROM public.order_items oi WHERE oi.order_id = o.id) AS item_count,
  c.tax_id AS customer_tax_id,
  COALESCE((SELECT SUM(ch.amount) FROM public.order_charges ch WHERE ch.order_id = o.id), 0)::numeric(12,2)
    AS charges_total
FROM public.orders o
JOIN public.customers c ON c.id = o.customer_id;

DROP VIEW IF EXISTS public.deliveries_view;
CREATE VIEW public.deliveries_view AS
SELECT
  d.*,
  o.order_number,
  o.signature_url AS order_signature_url,
  c.name AS customer_name,
  c.phone AS customer_phone,
  c.email AS customer_email,
  c.tax_id AS customer_tax_id,
  (d.total - d.amount_paid)::numeric(12,2) AS balance
FROM public.deliveries d
JOIN public.orders o ON o.id = d.order_id
JOIN public.customers c ON c.id = d.customer_id;

DROP VIEW IF EXISTS public.debtors_view;
CREATE VIEW public.debtors_view AS
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
  o.order_number,
  d.amount_paid,
  (d.total - d.amount_paid)::numeric(12,2) AS balance
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
    SELECT COALESCE(SUM(d.total - d.amount_paid), 0)::numeric
    FROM public.deliveries d
    WHERE d.payment_status = 'unpaid'::payment_status
      AND d.status <> 'cancelled'::delivery_status
  ) AS receivables_total,
  (
    SELECT COALESCE(SUM(o.total), 0)::numeric
    FROM public.orders o
    WHERE o.status <> 'cancelled'::order_status
      AND o.document_date >= date_trunc('month', public.crm_today())::date
      AND o.document_date < (date_trunc('month', public.crm_today()) + interval '1 month')::date
  ) AS monthly_revenue,
  (
    SELECT COALESCE(SUM(p.amount), 0)::numeric
    FROM public.payments p
    WHERE p.paid_at >= date_trunc('month', public.crm_today())::date
      AND p.paid_at < (date_trunc('month', public.crm_today()) + interval '1 month')::date
  ) AS monthly_payments_total,
  (
    SELECT COALESCE(SUM(e.amount_total), 0)::numeric
    FROM public.expenses e
    WHERE e.expense_date >= date_trunc('month', public.crm_today())::date
      AND e.expense_date < (date_trunc('month', public.crm_today()) + interval '1 month')::date
  ) AS monthly_expenses_total,
  (
    SELECT COUNT(*)::bigint
    FROM public.documents doc
    WHERE doc.status = 'pending_review'::public.document_status
  ) AS pending_documents_count;

DROP VIEW IF EXISTS public.payments_view;
CREATE VIEW public.payments_view AS
SELECT
  p.*,
  c.name AS customer_name,
  c.tax_id AS customer_tax_id,
  COALESCE(a.allocated, 0)::numeric(12,2) AS allocated_amount,
  (p.amount - COALESCE(a.allocated, 0))::numeric(12,2) AS unallocated_amount,
  COALESCE(a.delivery_numbers, ARRAY[]::bigint[]) AS delivery_numbers
FROM public.payments p
JOIN public.customers c ON c.id = p.customer_id
LEFT JOIN LATERAL (
  SELECT
    SUM(pa.amount) AS allocated,
    array_agg(d.delivery_number ORDER BY d.delivery_number) AS delivery_numbers
  FROM public.payment_allocations pa
  JOIN public.deliveries d ON d.id = pa.delivery_id
  WHERE pa.payment_id = p.id
) a ON true;

DROP VIEW IF EXISTS public.payment_allocations_view;
CREATE VIEW public.payment_allocations_view AS
SELECT
  pa.*,
  p.payment_number,
  p.paid_at,
  p.method,
  p.reference,
  p.customer_id,
  d.delivery_number,
  d.total AS delivery_total,
  o.order_number
FROM public.payment_allocations pa
JOIN public.payments p ON p.id = pa.payment_id
JOIN public.deliveries d ON d.id = pa.delivery_id
JOIN public.orders o ON o.id = d.order_id;

DROP VIEW IF EXISTS public.expenses_view;
CREATE VIEW public.expenses_view AS
SELECT
  e.*,
  s.name AS supplier_name,
  s.tax_id AS supplier_tax_id
FROM public.expenses e
LEFT JOIN public.suppliers s ON s.id = e.supplier_id;

DROP VIEW IF EXISTS public.documents_view;
CREATE VIEW public.documents_view AS
SELECT
  doc.*,
  c.name AS customer_name,
  s.name AS supplier_name,
  o.order_number,
  d.delivery_number,
  p.payment_number
FROM public.documents doc
LEFT JOIN public.customers c ON c.id = doc.customer_id
LEFT JOIN public.suppliers s ON s.id = doc.supplier_id
LEFT JOIN public.orders o ON o.id = doc.order_id
LEFT JOIN public.deliveries d ON d.id = doc.delivery_id
LEFT JOIN public.payments p ON p.id = doc.payment_id;

-- security_invoker + הרשאות לכל ה-Views
DO $$
DECLARE
  v text;
  views text[] := ARRAY[
    'inventory_items_view', 'orders_view', 'order_items_view', 'deliveries_view',
    'debtors_view', 'dashboard_kpis_view', 'quotes_view', 'quote_items_view',
    'payments_view', 'payment_allocations_view', 'expenses_view', 'documents_view'
  ];
BEGIN
  FOREACH v IN ARRAY views LOOP
    IF to_regclass('public.' || v) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v);
  END LOOP;
END;
$$;

-- =============================================================================
-- RLS + הרשאות: SELECT/INSERT/UPDATE לכל משתמש מורשה, DELETE למנהל בלבד
-- =============================================================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'stones', 'customers', 'inventory_items', 'customer_stone_prices',
    'orders', 'order_items', 'deliveries', 'delivery_items',
    'quotes', 'quote_items',
    'suppliers', 'documents', 'payments', 'payment_allocations',
    'expenses', 'order_charges'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_authenticated_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_crm_users_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_crm_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_crm_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_crm_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_crm_delete', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING ((SELECT public.is_crm_user()))',
      t || '_crm_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK ((SELECT public.is_crm_user()))',
      t || '_crm_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING ((SELECT public.is_crm_user())) WITH CHECK ((SELECT public.is_crm_user()))',
      t || '_crm_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
         USING ((SELECT public.is_crm_admin()))',
      t || '_crm_delete', t
    );
  END LOOP;
END;
$$;

-- חריגים (עריכה שמוחקת שורות-בת, לא מחיקת רשומה):
-- עריכת הצעת מחיר פתוחה מחליפה את כל השורות שלה
DROP POLICY IF EXISTS quote_items_crm_delete ON public.quote_items;
CREATE POLICY quote_items_crm_delete ON public.quote_items
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_crm_admin())
    OR (
      (SELECT public.is_crm_user())
      AND EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = quote_items.quote_id AND q.status = 'open'::public.quote_status
      )
    )
  );

-- הסרת חיוב נוסף מהזמנה (הטריגר חוסם אחרי הפקת תעודת משלוח)
DROP POLICY IF EXISTS order_charges_crm_delete ON public.order_charges;
CREATE POLICY order_charges_crm_delete ON public.order_charges
  FOR DELETE TO authenticated
  USING ((SELECT public.is_crm_user()));

-- ביטול שורת מלאי שנוצרה זה עתה כשיצירת הזמנה נכשלה (rollback בצד השרת)
DROP POLICY IF EXISTS inventory_items_crm_delete ON public.inventory_items;
CREATE POLICY inventory_items_crm_delete ON public.inventory_items
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_crm_admin())
    OR (
      (SELECT public.is_crm_user())
      AND created_at > now() - interval '10 minutes'
      AND quantity_reserved = 0
      AND quantity_delivered = 0
    )
  );

-- יומן פעולות: קריאה בלבד, כתיבה רק דרך הטריגר
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.activity_log FROM anon, authenticated;
GRANT SELECT ON public.activity_log TO authenticated;
DROP POLICY IF EXISTS activity_log_crm_select ON public.activity_log;
CREATE POLICY activity_log_crm_select ON public.activity_log
  FOR SELECT TO authenticated
  USING ((SELECT public.is_crm_user()));
REVOKE ALL ON SEQUENCE public.activity_log_id_seq FROM anon, authenticated;

REVOKE ALL ON SEQUENCE public.payment_number_seq FROM anon;
GRANT USAGE, SELECT ON SEQUENCE public.payment_number_seq TO authenticated;

-- הרשאות הרצה לפונקציות החדשות
REVOKE EXECUTE ON FUNCTION public.crm_today() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crm_record_payment(uuid, numeric, date, public.payment_method, text, text, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crm_mark_delivery_paid(uuid, public.payment_method, date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crm_recalc_order_totals(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crm_delete_order(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crm_delete_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_today() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_record_payment(uuid, numeric, date, public.payment_method, text, text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_mark_delivery_paid(uuid, public.payment_method, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_recalc_order_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_delete_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_delete_quote(uuid) TO authenticated;

-- =============================================================================
-- 12. Supabase Storage: דלי פרטי "documents"
-- (מדולג אוטומטית בסביבה בלי Storage, למשל Postgres מקומי)
-- =============================================================================
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage schema not found — skipping bucket setup';
    RETURN;
  END IF;

  EXECUTE $q$
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'documents', 'documents', false, 20971520,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
    )
    ON CONFLICT (id) DO UPDATE SET
      public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types
  $q$;

  EXECUTE 'DROP POLICY IF EXISTS crm_documents_select ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS crm_documents_insert ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS crm_documents_update ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS crm_documents_delete ON storage.objects';

  EXECUTE $q$
    CREATE POLICY crm_documents_select ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'documents' AND (SELECT public.is_crm_user()))
  $q$;
  EXECUTE $q$
    CREATE POLICY crm_documents_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'documents' AND (SELECT public.is_crm_user()))
  $q$;
  EXECUTE $q$
    CREATE POLICY crm_documents_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'documents' AND (SELECT public.is_crm_user()))
      WITH CHECK (bucket_id = 'documents' AND (SELECT public.is_crm_user()))
  $q$;
  EXECUTE $q$
    CREATE POLICY crm_documents_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'documents' AND (SELECT public.is_crm_admin()))
  $q$;
END;
$$;

COMMIT;

-- רענון ה-schema cache של PostgREST
NOTIFY pgrst, 'reload schema';
