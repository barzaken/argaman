"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, ExternalLink, Loader2, PlugZap, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actionCrashed } from "@/lib/action-client";
import { cn } from "@/lib/utils";
import { getConnectionStatus, type ConnectionStatus } from "@/app/dashboard/green-invoice/actions";
import { GiEnvBadge, SummaryRow } from "@/components/green-invoice/shared";

const API_KEYS_HELP_URL =
  "https://support.greeninvoice.co.il/kb/he/article/%D7%90%D7%99%D7%9A-%D7%9C%D7%99%D7%A6%D7%95%D7%A8-%D7%9E%D7%A4%D7%AA%D7%97%D7%95%D7%AA-api";

/**
 * כרטיס הגדרות Green Invoice לדף ההגדרות: מצב החיבור, סביבה (בדיקות / ייצור), שם העסק,
 * כפתור "בדיקת חיבור" והוראות הגדרה. בלי props. יש לו id="green-invoice" (הקישורים "לא מחובר" מפנים אליו).
 */
export function GreenInvoiceSettingsCard({ className }: { className?: string }) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async (announce: boolean) => {
    setLoading(true);
    const res = await getConnectionStatus().catch(actionCrashed);
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      if (announce) toast.error(res.message);
      return;
    }
    setError(null);
    setStatus(res.status);
    if (announce) {
      if (res.status.tokenOk && !res.status.error) toast.success("החיבור ל-Green Invoice תקין");
      else if (!res.status.configured) toast.error("Green Invoice לא מוגדר");
      else toast.error(res.status.error ?? "בדיקת החיבור נכשלה");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- בדיקת חיבור ראשונית מהשרת
    void check(false);
  }, [check]);

  const state: "ok" | "warn" | "error" | "off" | null = !status
    ? null
    : !status.configured
      ? "off"
      : status.tokenOk === false
        ? "error"
        : status.error
          ? "warn"
          : "ok";

  return (
    <section
      id="green-invoice"
      dir="rtl"
      className={cn("flex scroll-mt-20 flex-col gap-4 rounded-xl border bg-card p-4 text-sm text-card-foreground", className)}
      aria-labelledby="green-invoice-title"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PlugZap className="size-5 text-muted-foreground" aria-hidden />
          <h2 id="green-invoice-title" className="text-base font-semibold">
            Green Invoice (Morning)
          </h2>
          {status ? <GiEnvBadge env={status.env} /> : null}
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void check(true)}>
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
          בדיקת חיבור
        </Button>
      </header>

      {error ? <p className="text-destructive">{error}</p> : null}

      {status ? (
        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center gap-2 font-medium">
            {state === "ok" ? (
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
            ) : state === "warn" ? (
              <CircleAlert className="size-4 text-amber-600" aria-hidden />
            ) : (
              <XCircle className="size-4 text-destructive" aria-hidden />
            )}
            {state === "ok"
              ? "מחובר"
              : state === "warn"
                ? "מחובר, עם אזהרה"
                : state === "off"
                  ? "לא מוגדר"
                  : "החיבור נכשל"}
          </div>
          {status.configured ? (
            <>
              <SummaryRow label="שם העסק" value={status.businessName ?? "—"} />
              <SummaryRow label="שרת" value={<span dir="ltr">{status.apiHost}</span>} />
              <SummaryRow
                label="התחברות (טוקן)"
                value={status.tokenOk ? "תקינה" : status.tokenOk === false ? "נכשלה" : "—"}
              />
              {status.nextInvoiceNumber !== null ? (
                <SummaryRow label="מספר חשבונית המס הבאה" value={status.nextInvoiceNumber} />
              ) : null}
              {status.vatRate !== null ? (
                <SummaryRow label="שיעור מע״מ בחשבון" value={`${Math.round(status.vatRate * 100)}%`} />
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">
              חסרים משתני סביבה:{" "}
              {status.missing.map((m) => (
                <code key={m} dir="ltr" className="mx-0.5 rounded bg-muted px-1 py-0.5 text-xs">
                  {m}
                </code>
              ))}
            </p>
          )}
          {status.error && status.configured ? <p className="mt-2 text-destructive">{status.error}</p> : null}
        </div>
      ) : loading ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          בודק חיבור…
        </p>
      ) : null}

      <details className="group rounded-lg border p-3" open={state === "off"}>
        <summary className="cursor-pointer font-medium">הוראות חיבור</summary>
        <ol className="mt-3 list-decimal space-y-2 ps-5 leading-relaxed">
          <li>
            ב-Green Invoice (Morning) נכנסים ל<b>הגדרות ← כלי מפתחים ← מפתחות API</b> ויוצרים מפתח חדש. שומרים את{" "}
            <b>מזהה המפתח (ID)</b> ואת <b>הסוד (Secret)</b> — הסוד מוצג פעם אחת בלבד.{" "}
            <a
              href={API_KEYS_HELP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-primary underline-offset-4 hover:underline"
            >
              מדריך של Green Invoice
              <ExternalLink className="size-3" aria-hidden />
            </a>
            . נדרש מנוי שכולל גישת API.
          </li>
          <li>
            לבדיקות: לסביבת הבדיקות יש חשבון ומפתחות נפרדים (
            <span dir="ltr">sandbox.d.greeninvoice.co.il</span>). מומלץ להתחיל שם — מסמכים בסביבת הבדיקות אינם
            מסמכים חשבונאיים אמיתיים.
          </li>
          <li>
            ב-Vercel: <b>Project ← Settings ← Environment Variables</b> מוסיפים:
            <ul className="mt-1 space-y-1">
              {[
                ["GREEN_INVOICE_API_KEY_ID", "מזהה המפתח"],
                ["GREEN_INVOICE_API_KEY_SECRET", "הסוד (Sensitive)"],
                ["GREEN_INVOICE_ENV", "sandbox לבדיקות, production לחשבון האמיתי"],
              ].map(([k, v]) => (
                <li key={k} className="flex flex-wrap items-center gap-2">
                  <code dir="ltr" className="rounded bg-muted px-1 py-0.5 text-xs">
                    {k}
                  </code>
                  <span className="text-muted-foreground">{v}</span>
                </li>
              ))}
            </ul>
          </li>
          <li>
            אחרי שמירת המשתנים צריך <b>פריסה מחדש</b> (Deployments ← ⋯ ← Redeploy) — משתנים חדשים נכנסים לתוקף רק
            בפריסה חדשה. ואז לוחצים כאן &quot;בדיקת חיבור&quot;.
          </li>
          <li>
            כל עוד <code dir="ltr" className="rounded bg-muted px-1 py-0.5 text-xs">GREEN_INVOICE_ENV</code> לא מוגדר
            במפורש כ-<code dir="ltr" className="rounded bg-muted px-1 py-0.5 text-xs">production</code>, המערכת עובדת
            מול סביבת הבדיקות.
          </li>
        </ol>
      </details>

      {status ? (
        <p className="text-xs text-muted-foreground">
          <Badge variant="outline" className="me-1">
            {status.env === "production" ? "ייצור" : "בדיקות"}
          </Badge>
          חשבוניות וקבלות שמופקות כאן מקבלות מספר רץ ב-Green Invoice ואינן ניתנות למחיקה — תיקון רק בחשבונית זיכוי.
        </p>
      ) : null}
    </section>
  );
}
