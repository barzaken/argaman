-- =============================================================================
-- patch-2026-11-memorials.sql
-- מצב "מצבות" (לקוחות פרטיים): לידים מהאתר, הזמנות, אישור נוסח דיגיטלי, תזכורות.
-- תוספתי בלבד: לא נוגע בטבלאות / views של צד הקבלנים.
-- להרצה פעם אחת ב-Supabase SQL Editor (בטוח להרצה חוזרת).
--
-- אחרי ההרצה: קובעים סוד קליטה (לא נשמר בריפו):
--   insert into public.mem_settings(key, value) values ('intake_secret', '<סוד ארוך>')
--   on conflict (key) do update set value = excluded.value;
-- ואותו ערך במשתנה MEM_INTAKE_SECRET בפרויקט Vercel של האתר.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- הרשאת "מצבות בלבד" לעובדים עתידיים
-- ---------------------------------------------------------------------------
ALTER TABLE public.crm_users ADD COLUMN IF NOT EXISTS memorials_only boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- הגדרות פרטיות (RLS בלי מדיניות = אף משתמש לא קורא; רק פונקציות SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mem_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE public.mem_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mem_settings FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- לידים
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mem_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'contact'
    CHECK (source IN ('contact','configurator','service','obituary','google_lead_form','phone','manual','other')),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','converted','lost','spam')),
  name text NOT NULL,
  phone text,
  email text,
  message text,
  summary text,
  deceased_name text,
  death_date date,
  design_code text,
  design_url text,
  page_url text,
  landing_page text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  gclid text,
  gbraid text,
  wbraid text,
  marketing_consent boolean NOT NULL DEFAULT false,
  external_id text,
  first_contact_at timestamptz,
  lost_reason text,
  notes text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  order_id uuid,
  raw jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS mem_leads_external_id_key ON public.mem_leads(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mem_leads_created_at_idx ON public.mem_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS mem_leads_status_idx ON public.mem_leads(status);
CREATE INDEX IF NOT EXISTS mem_leads_phone_idx ON public.mem_leads(phone);

-- ---------------------------------------------------------------------------
-- הזמנות (מצבה / ניקוי קבר / חידוש אותיות)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.mem_orders_number_seq START 1001;

CREATE TABLE IF NOT EXISTS public.mem_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number integer NOT NULL UNIQUE DEFAULT nextval('public.mem_orders_number_seq'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.mem_leads(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'headstone'
    CHECK (kind IN ('headstone','cleaning','lettering','other')),
  stage text NOT NULL DEFAULT 'call'
    CHECK (stage IN ('call','quote','deposit','render_approval','production','engraving','installation','done','cancelled')),
  customer_name text NOT NULL,
  phone text,
  email text,
  address text,
  city text,
  deceased_name text,
  death_date date,
  hebrew_death_date text,
  cemetery text,
  grave_location text,
  price numeric(12,2),
  deposit_amount numeric(12,2),
  design_code text,
  design_url text,
  wording text,
  installation_date date,
  notes text,
  cancel_reason text
);
ALTER SEQUENCE public.mem_orders_number_seq OWNED BY public.mem_orders.number;
CREATE INDEX IF NOT EXISTS mem_orders_stage_idx ON public.mem_orders(stage);
CREATE INDEX IF NOT EXISTS mem_orders_lead_idx ON public.mem_orders(lead_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mem_leads_order_id_fkey') THEN
    ALTER TABLE public.mem_leads
      ADD CONSTRAINT mem_leads_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.mem_orders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- תמונות (הדמיה מהמעצב באתר, הדמיה סופית, חתימה) — נשמרות כ-bytea בטבלה נפרדת
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mem_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  lead_id uuid REFERENCES public.mem_leads(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.mem_orders(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'design' CHECK (kind IN ('design','render','signature','other')),
  mime text NOT NULL DEFAULT 'image/jpeg' CHECK (mime IN ('image/jpeg','image/png','image/webp')),
  bytes integer NOT NULL,
  data bytea NOT NULL,
  CHECK (bytes <= 3000000)
);
CREATE INDEX IF NOT EXISTS mem_images_lead_idx ON public.mem_images(lead_id);
CREATE INDEX IF NOT EXISTS mem_images_order_idx ON public.mem_images(order_id);

-- ---------------------------------------------------------------------------
-- מעקב דיווח לידים לכל משתמש (אינסטינקט מדווח לכל משתמש פעם אחת)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mem_lead_reports (
  lead_id uuid NOT NULL REFERENCES public.mem_leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, user_id)
);

-- ---------------------------------------------------------------------------
-- תשלומים ומסמכי Morning להזמנות פרטיות
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mem_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  order_id uuid NOT NULL REFERENCES public.mem_orders(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL DEFAULT 'transfer' CHECK (method IN ('cash','cheque','card','transfer','app','other')),
  paid_at date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jerusalem')::date,
  is_deposit boolean NOT NULL DEFAULT false,
  note text,
  document_id uuid
);
CREATE INDEX IF NOT EXISTS mem_payments_order_idx ON public.mem_payments(order_id);

CREATE TABLE IF NOT EXISTS public.mem_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  order_id uuid NOT NULL REFERENCES public.mem_orders(id) ON DELETE CASCADE,
  doc_type integer NOT NULL CHECK (doc_type IN (300,305,320,330,400)),
  amount numeric(12,2) NOT NULL,
  morning_id text,
  morning_number text,
  url text,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','issued','failed'))
);
CREATE INDEX IF NOT EXISTS mem_documents_order_idx ON public.mem_documents(order_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mem_payments_document_id_fkey') THEN
    ALTER TABLE public.mem_payments
      ADD CONSTRAINT mem_payments_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.mem_documents(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- אישור נוסח דיגיטלי (קישור ציבורי עם טוקן)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mem_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  order_id uuid NOT NULL REFERENCES public.mem_orders(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  wording text NOT NULL,
  image_id uuid REFERENCES public.mem_images(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','cancelled')),
  signed_at timestamptz,
  signer_name text,
  signer_note text,
  signature_image_id uuid REFERENCES public.mem_images(id) ON DELETE SET NULL,
  signer_user_agent text
);
CREATE INDEX IF NOT EXISTS mem_approvals_order_idx ON public.mem_approvals(order_id);

-- ---------------------------------------------------------------------------
-- תזכורות לצוות (מעקב, שלושים, אזכרה) — שליחה אוטומטית ללקוח תיבנה בהמשך
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mem_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  order_id uuid REFERENCES public.mem_orders(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.mem_leads(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('follow_up','shloshim','azkara','custom')),
  due_date date NOT NULL,
  title text NOT NULL,
  note text,
  done_at timestamptz,
  done_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (order_id IS NOT NULL OR lead_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS mem_reminders_due_idx ON public.mem_reminders(due_date) WHERE done_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mem_reminders_order_kind_date_key
  ON public.mem_reminders(order_id, kind, due_date) WHERE order_id IS NOT NULL AND kind IN ('shloshim','azkara');

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS mem_leads_set_updated_at ON public.mem_leads;
CREATE TRIGGER mem_leads_set_updated_at BEFORE UPDATE ON public.mem_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS mem_orders_set_updated_at ON public.mem_orders;
CREATE TRIGGER mem_orders_set_updated_at BEFORE UPDATE ON public.mem_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- תזכורות שלושים / אזכרה אוטומטיות לפי תאריך פטירה בהזמנה
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mem_sync_memorial_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  v_name text;
  v_azkara date;
BEGIN
  IF NEW.death_date IS NULL OR NEW.stage = 'cancelled' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.death_date IS NOT DISTINCT FROM NEW.death_date AND OLD.stage <> 'cancelled' THEN
    RETURN NULL;
  END IF;
  v_name := coalesce(nullif(NEW.deceased_name, ''), NEW.customer_name);

  -- תאריכים קודמים שלא בוצעו (אם התאריך תוקן) — נמחקים
  DELETE FROM public.mem_reminders
   WHERE order_id = NEW.id AND kind IN ('shloshim','azkara') AND done_at IS NULL;

  IF NEW.death_date + 30 >= v_today THEN
    INSERT INTO public.mem_reminders(order_id, kind, due_date, title)
    VALUES (NEW.id, 'shloshim', NEW.death_date + 30 - 3, 'שלושים ל' || v_name || ' (' || to_char(NEW.death_date + 30, 'DD/MM/YYYY') || ') — להתקשר למשפחה')
    ON CONFLICT DO NOTHING;
  END IF;

  -- אזכרה שנתית קרובה (לפי תאריך לועזי; מועד עברי מדויק — לפי hebrew_death_date)
  v_azkara := (NEW.death_date + interval '1 year')::date;
  WHILE v_azkara < v_today LOOP
    v_azkara := (v_azkara + interval '1 year')::date;
  END LOOP;
  INSERT INTO public.mem_reminders(order_id, kind, due_date, title)
  VALUES (NEW.id, 'azkara', v_azkara - 14, 'אזכרה ל' || v_name || ' (בסביבות ' || to_char(v_azkara, 'DD/MM/YYYY') || ') — להתקשר למשפחה')
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mem_sync_memorial_reminders() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS mem_orders_sync_reminders ON public.mem_orders;
CREATE TRIGGER mem_orders_sync_reminders AFTER INSERT OR UPDATE OF death_date, stage ON public.mem_orders
  FOR EACH ROW EXECUTE FUNCTION public.mem_sync_memorial_reminders();

-- כשמסמנים אזכרה כבוצעה — נוצרת אזכרה לשנה הבאה
CREATE OR REPLACE FUNCTION public.mem_next_azkara()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.kind = 'azkara' AND NEW.order_id IS NOT NULL AND OLD.done_at IS NULL AND NEW.done_at IS NOT NULL THEN
    INSERT INTO public.mem_reminders(order_id, kind, due_date, title)
    VALUES (NEW.order_id, 'azkara', (NEW.due_date + interval '1 year')::date,
            regexp_replace(NEW.title, '\(בסביבות [0-9/]+\)', '(בסביבות ' || to_char((NEW.due_date + 14 + interval '1 year')::date, 'DD/MM/YYYY') || ')'))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mem_next_azkara() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS mem_reminders_next_azkara ON public.mem_reminders;
CREATE TRIGGER mem_reminders_next_azkara AFTER UPDATE OF done_at ON public.mem_reminders
  FOR EACH ROW EXECUTE FUNCTION public.mem_next_azkara();

-- ---------------------------------------------------------------------------
-- יומן פעילות (בלי mem_images — bytea גדול)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  IF to_regproc('public.crm_activity_log_trigger') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['mem_leads','mem_orders','mem_payments','mem_documents','mem_approvals','mem_reminders'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_activity_log', t);
      EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.crm_activity_log_trigger()', t || '_activity_log', t);
    END LOOP;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- RLS: משתמשי CRM בלבד (כמו שאר הטבלאות)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mem_leads','mem_orders','mem_images','mem_lead_reports','mem_payments','mem_documents','mem_approvals','mem_reminders'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_crm_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING ((SELECT public.is_crm_user())) WITH CHECK ((SELECT public.is_crm_user()))', t || '_crm_all', t);
  END LOOP;
END $$;
GRANT USAGE ON SEQUENCE public.mem_orders_number_seq TO authenticated;

-- דיווח לידים: כל משתמש רואה / מסמן רק את שלו
DROP POLICY IF EXISTS mem_lead_reports_crm_all ON public.mem_lead_reports;
DROP POLICY IF EXISTS mem_lead_reports_own ON public.mem_lead_reports;
CREATE POLICY mem_lead_reports_own ON public.mem_lead_reports FOR ALL TO authenticated
  USING ((SELECT public.is_crm_user()) AND user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.is_crm_user()) AND user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- RPC ציבוריות (anon) — מוגנות בסוד / טוקן
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mem_check_intake_secret(p_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mem_settings
     WHERE key = 'intake_secret' AND length(value) >= 24 AND value = p_secret
  );
$$;
REVOKE EXECUTE ON FUNCTION public.mem_check_intake_secret(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mem_intake_lead(p_secret text, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_existing uuid;
  v_phone text;
  v_img bytea;
  v_mime text;
  v_source text;
  v_death date;
  v_external text;
BEGIN
  IF NOT public.mem_check_intake_secret(p_secret) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  v_phone := nullif(regexp_replace(coalesce(p->>'phone', ''), '[^0-9+]', '', 'g'), '');
  v_source := coalesce(nullif(p->>'source', ''), 'contact');
  IF v_source NOT IN ('contact','configurator','service','obituary','google_lead_form','phone','manual','other') THEN
    v_source := 'other';
  END IF;
  v_external := nullif(p->>'external_id', '');

  IF nullif(trim(coalesce(p->>'name', '')), '') IS NULL THEN
    RAISE EXCEPTION 'name required' USING ERRCODE = '22023';
  END IF;

  -- כפילות: אותו מזהה חיצוני, או אותו טלפון + מקור בעשר הדקות האחרונות
  IF v_external IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.mem_leads WHERE external_id = v_external;
  END IF;
  IF v_existing IS NULL AND v_phone IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.mem_leads
     WHERE phone = v_phone AND source = v_source AND created_at > now() - interval '10 minutes'
     ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing, 'duplicate', true);
  END IF;

  BEGIN
    v_death := nullif(p->>'death_date', '')::date;
  EXCEPTION WHEN others THEN
    v_death := NULL;
  END;

  INSERT INTO public.mem_leads (
    source, name, phone, email, message, summary, deceased_name, death_date,
    design_code, design_url, page_url, landing_page, referrer,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, gbraid, wbraid,
    marketing_consent, external_id, raw
  ) VALUES (
    v_source,
    left(trim(p->>'name'), 120),
    v_phone,
    left(nullif(trim(coalesce(p->>'email', '')), ''), 200),
    left(nullif(p->>'message', ''), 4000),
    left(nullif(p->>'summary', ''), 4000),
    left(nullif(trim(coalesce(p->>'deceased_name', '')), ''), 200),
    v_death,
    left(nullif(p->>'design_code', ''), 4000),
    left(nullif(p->>'design_url', ''), 4000),
    left(nullif(p->>'page_url', ''), 1000),
    left(nullif(p->>'landing_page', ''), 1000),
    left(nullif(p->>'referrer', ''), 1000),
    left(nullif(p->>'utm_source', ''), 200),
    left(nullif(p->>'utm_medium', ''), 200),
    left(nullif(p->>'utm_campaign', ''), 200),
    left(nullif(p->>'utm_term', ''), 200),
    left(nullif(p->>'utm_content', ''), 200),
    left(nullif(p->>'gclid', ''), 300),
    left(nullif(p->>'gbraid', ''), 300),
    left(nullif(p->>'wbraid', ''), 300),
    coalesce((p->>'marketing_consent')::boolean, false),
    v_external,
    CASE WHEN p ? 'raw' THEN p->'raw' ELSE NULL END
  )
  RETURNING id INTO v_id;

  IF nullif(p->>'image_base64', '') IS NOT NULL THEN
    BEGIN
      v_img := decode(p->>'image_base64', 'base64');
      v_mime := coalesce(nullif(p->>'image_mime', ''), 'image/jpeg');
      IF v_mime IN ('image/jpeg','image/png','image/webp') AND length(v_img) BETWEEN 100 AND 3000000 THEN
        INSERT INTO public.mem_images(lead_id, kind, mime, bytes, data)
        VALUES (v_id, 'design', v_mime, length(v_img), v_img);
      END IF;
    EXCEPTION WHEN others THEN
      NULL; -- תמונה פגומה לא מפילה את הליד
    END;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'duplicate', false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mem_intake_lead(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mem_intake_lead(text, jsonb) TO anon, authenticated;

-- אישור נוסח: קריאה לפי טוקן
CREATE OR REPLACE FUNCTION public.mem_get_approval(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN NULL;
  END IF;
  SELECT a.id, a.status, a.wording, a.signed_at, a.signer_name, a.created_at,
         o.number, o.customer_name, o.deceased_name, o.cemetery, o.kind,
         i.mime AS image_mime, i.data AS image_data
    INTO r
    FROM public.mem_approvals a
    JOIN public.mem_orders o ON o.id = a.order_id
    LEFT JOIN public.mem_images i ON i.id = a.image_id
   WHERE a.token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'status', r.status,
    'wording', r.wording,
    'signed_at', r.signed_at,
    'signer_name', r.signer_name,
    'created_at', r.created_at,
    'order_number', r.number,
    'customer_name', r.customer_name,
    'deceased_name', r.deceased_name,
    'cemetery', r.cemetery,
    'image', CASE WHEN r.image_data IS NULL THEN NULL
                  ELSE 'data:' || r.image_mime || ';base64,' || replace(encode(r.image_data, 'base64'), E'\n', '') END
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mem_get_approval(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mem_get_approval(text) TO anon, authenticated;

-- אישור נוסח: חתימה
CREATE OR REPLACE FUNCTION public.mem_sign_approval(
  p_token text,
  p_signer_name text,
  p_signature_png_base64 text,
  p_note text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a record;
  v_sig bytea;
  v_img uuid;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO a FROM public.mem_approvals WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;
  IF a.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'status', a.status);
  END IF;
  IF nullif(trim(coalesce(p_signer_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'signer name required' USING ERRCODE = '22023';
  END IF;
  v_sig := decode(regexp_replace(coalesce(p_signature_png_base64, ''), '^data:image/png;base64,', ''), 'base64');
  IF length(v_sig) < 200 OR length(v_sig) > 1500000 THEN
    RAISE EXCEPTION 'invalid signature' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.mem_images(order_id, kind, mime, bytes, data)
  VALUES (a.order_id, 'signature', 'image/png', length(v_sig), v_sig)
  RETURNING id INTO v_img;

  UPDATE public.mem_approvals
     SET status = 'signed',
         signed_at = now(),
         signer_name = left(trim(p_signer_name), 120),
         signer_note = left(nullif(trim(coalesce(p_note, '')), ''), 2000),
         signature_image_id = v_img,
         signer_user_agent = left(p_user_agent, 400)
   WHERE id = a.id;

  -- הנוסח המאושר נשמר בהזמנה
  UPDATE public.mem_orders SET wording = a.wording WHERE id = a.order_id;

  RETURN jsonb_build_object('ok', true, 'status', 'signed');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mem_sign_approval(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mem_sign_approval(text, text, text, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- ניהול הרשאת "מצבות בלבד" (מנהלים)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_set_user_memorials_only(p_user_id uuid, p_value boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_crm_admin() THEN
    RAISE EXCEPTION 'רק מנהל יכול לשנות הרשאות' USING ERRCODE = '42501';
  END IF;
  UPDATE public.crm_users SET memorials_only = coalesce(p_value, false) WHERE user_id = p_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.crm_set_user_memorials_only(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_set_user_memorials_only(uuid, boolean) TO authenticated;

-- האם המשתמש הנוכחי מוגבל למצבות בלבד
CREATE OR REPLACE FUNCTION public.crm_is_memorials_only()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce((SELECT memorials_only FROM public.crm_users WHERE user_id = auth.uid()), false);
$$;
REVOKE EXECUTE ON FUNCTION public.crm_is_memorials_only() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_is_memorials_only() TO authenticated;

-- רשימת המשתמשים המוגבלים למצבות (למסך ההגדרות; מנהלים בלבד)
CREATE OR REPLACE FUNCTION public.crm_memorials_only_users()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_crm_admin() THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT user_id FROM public.crm_users WHERE memorials_only;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.crm_memorials_only_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_memorials_only_users() TO authenticated;
