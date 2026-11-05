-- =============================================================================
-- Argaman CRM — קישורים בין מסמכים + הפקת כל סוגי המסמכים ב-Morning (נובמבר 2026)
-- =============================================================================
-- להריץ פעם אחת: Supabase Dashboard → SQL Editor → להדביק את כל הקובץ → Run.
-- הקובץ בטוח להרצה חוזרת (idempotent). להריץ אחרי:
--   patch-2026-11-documents-payments.sql
--
-- מה הקובץ מוסיף:
--
-- 1. document_links — קישור בין שני מסמכים בארכיון המסמכים (documents):
--    קבלה ← חשבונית, חשבונית ← הזמנה / הצעת מחיר / תעודת משלוח,
--    חשבונית זיכוי ← החשבונית שבוטלה, תעודת החזרה ← תעודת משלוח, משיכת פיקדון ← פיקדון.
--    סוג הקישור: link (קשור), cancel (מבטל), copy (העתק), related (קשור — הוזן ידנית).
--    מסמך שמופק ב-Morning עם linkedDocumentIds מקבל את הקישורים אוטומטית.
--    כל משתמש מורשה יכול להוסיף קישור; הסרת קישור — מנהל בלבד.
--
-- 2. gi_issue_requests — נעילה נגד הפקה כפולה של מסמך Morning מהטופס הכללי
--    (/dashboard/green-invoice/documents/new). כל טופס שולח מזהה בקשה ייחודי;
--    לחיצה כפולה / שליחה חוזרת עם אותו מזהה לא תפיק מסמך שני.
--
-- 3. הגנת הכפילות של documents (אותו סוג + ח.פ + מספר) מבחינה עכשיו גם בסוג
--    המסמך של Morning כשהסוג אצלנו הוא "אחר" — הצעת מחיר 1001 והזמנה 1001
--    של אותו לקוח הם שני מסמכים שונים (ב-Morning כל סוג ממוספר בנפרד).
--
-- 4. document_links_view (security_invoker) — הקישורים עם פרטי שני המסמכים.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. document_links
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  to_document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  link_type text NOT NULL DEFAULT 'related',
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_links_type_chk CHECK (link_type IN ('link', 'cancel', 'copy', 'related')),
  CONSTRAINT document_links_not_self_chk CHECK (from_document_id <> to_document_id),
  CONSTRAINT document_links_unique UNIQUE (from_document_id, to_document_id)
);

CREATE INDEX IF NOT EXISTS document_links_to_idx ON public.document_links (to_document_id);

COMMENT ON TABLE public.document_links IS
  'קישור בין מסמכים: from = המסמך החדש (קבלה / זיכוי / חשבונית), to = המסמך שהוא מתייחס אליו';

ALTER TABLE public.document_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_links FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_links TO authenticated;

DROP POLICY IF EXISTS document_links_crm_select ON public.document_links;
CREATE POLICY document_links_crm_select ON public.document_links
  FOR SELECT TO authenticated USING ((SELECT public.is_crm_user()));
DROP POLICY IF EXISTS document_links_crm_insert ON public.document_links;
CREATE POLICY document_links_crm_insert ON public.document_links
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_crm_user()));
DROP POLICY IF EXISTS document_links_crm_update ON public.document_links;
CREATE POLICY document_links_crm_update ON public.document_links
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_crm_user())) WITH CHECK ((SELECT public.is_crm_user()));
DROP POLICY IF EXISTS document_links_crm_delete ON public.document_links;
CREATE POLICY document_links_crm_delete ON public.document_links
  FOR DELETE TO authenticated USING ((SELECT public.is_crm_admin()));

-- -----------------------------------------------------------------------------
-- 2. gi_issue_requests — נעילת הפקה
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gi_issue_requests (
  -- מזהה הבקשה שהטופס יוצר (crypto.randomUUID) — המפתח הוא הנעילה
  id uuid PRIMARY KEY,
  doc_type integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  green_invoice_id text,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  description text,
  client_name text,
  amount numeric(14,2),
  error text,
  -- מתחלף בכל "תפיסה" של הנעילה; עדכון מותנה לפיו מונע ששתי בקשות יחזיקו בה
  lock_token text,
  created_by uuid DEFAULT auth.uid(),
  locked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gi_issue_requests_status_chk CHECK (status IN ('pending', 'issued', 'failed'))
);

ALTER TABLE public.gi_issue_requests ADD COLUMN IF NOT EXISTS lock_token text;

CREATE INDEX IF NOT EXISTS gi_issue_requests_status_idx ON public.gi_issue_requests (status, locked_at);

DO $$
BEGIN
  IF to_regproc('public.set_updated_at') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS gi_issue_requests_set_updated_at ON public.gi_issue_requests;
    CREATE TRIGGER gi_issue_requests_set_updated_at
      BEFORE UPDATE ON public.gi_issue_requests
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

ALTER TABLE public.gi_issue_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gi_issue_requests FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gi_issue_requests TO authenticated;

DROP POLICY IF EXISTS gi_issue_requests_crm_select ON public.gi_issue_requests;
CREATE POLICY gi_issue_requests_crm_select ON public.gi_issue_requests
  FOR SELECT TO authenticated USING ((SELECT public.is_crm_user()));
DROP POLICY IF EXISTS gi_issue_requests_crm_insert ON public.gi_issue_requests;
CREATE POLICY gi_issue_requests_crm_insert ON public.gi_issue_requests
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_crm_user()));
DROP POLICY IF EXISTS gi_issue_requests_crm_update ON public.gi_issue_requests;
CREATE POLICY gi_issue_requests_crm_update ON public.gi_issue_requests
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_crm_user())) WITH CHECK ((SELECT public.is_crm_user()));
DROP POLICY IF EXISTS gi_issue_requests_crm_delete ON public.gi_issue_requests;
CREATE POLICY gi_issue_requests_crm_delete ON public.gi_issue_requests
  FOR DELETE TO authenticated USING ((SELECT public.is_crm_admin()));

-- -----------------------------------------------------------------------------
-- 3. הגנת כפילות במסמכים: סוג Morning נכנס למפתח כשהסוג אצלנו "אחר"
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'documents_duplicate_unique'
      AND indexdef LIKE '%green_invoice_type%'
  ) THEN
    DROP INDEX IF EXISTS public.documents_duplicate_unique;
    CREATE UNIQUE INDEX documents_duplicate_unique
      ON public.documents (
        kind,
        COALESCE(counterparty_tax_id, ''),
        document_number,
        (CASE WHEN kind = 'other'::public.document_kind THEN COALESCE(green_invoice_type, 0) ELSE 0 END)
      )
      WHERE document_number IS NOT NULL AND status <> 'rejected'::public.document_status;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS documents_green_invoice_id_idx
  ON public.documents (green_invoice_id) WHERE green_invoice_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. document_links_view
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.document_links_view;
CREATE VIEW public.document_links_view AS
SELECT
  l.id,
  l.from_document_id,
  l.to_document_id,
  l.link_type,
  l.note,
  l.created_by,
  l.created_at,
  f.kind AS from_kind,
  f.document_number AS from_document_number,
  f.document_date AS from_document_date,
  f.amount_total AS from_amount_total,
  f.currency AS from_currency,
  f.counterparty_name AS from_counterparty_name,
  f.green_invoice_type AS from_green_invoice_type,
  f.green_invoice_url AS from_green_invoice_url,
  f.status AS from_status,
  t.kind AS to_kind,
  t.document_number AS to_document_number,
  t.document_date AS to_document_date,
  t.amount_total AS to_amount_total,
  t.currency AS to_currency,
  t.counterparty_name AS to_counterparty_name,
  t.green_invoice_type AS to_green_invoice_type,
  t.green_invoice_url AS to_green_invoice_url,
  t.status AS to_status
FROM public.document_links l
JOIN public.documents f ON f.id = l.from_document_id
JOIN public.documents t ON t.id = l.to_document_id;

ALTER VIEW public.document_links_view SET (security_invoker = true);
REVOKE ALL ON public.document_links_view FROM anon;
GRANT SELECT ON public.document_links_view TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. יומן פעולות (אם קיים)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regproc('public.crm_activity_log_trigger') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS crm_activity_log ON public.document_links;
    CREATE TRIGGER crm_activity_log AFTER INSERT OR UPDATE OR DELETE ON public.document_links
      FOR EACH ROW EXECUTE FUNCTION public.crm_activity_log_trigger();
  END IF;
END;
$$;
