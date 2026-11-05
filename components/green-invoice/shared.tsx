"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, FileText, Loader2, PlugZap } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GI_ENV_LABELS, GI_SETTINGS_HREF } from "@/lib/green-invoice/status";
import type { GreenInvoiceEnv } from "@/lib/green-invoice/config";

/** קישור מעומעם כשאין חיבור ל-Green Invoice */
export function GiNotConnectedLink({ className }: { className?: string }) {
  return (
    <Link
      href={GI_SETTINGS_HREF}
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline",
        className
      )}
    >
      <PlugZap className="size-3.5" aria-hidden />
      Green Invoice לא מחובר — הגדרות
    </Link>
  );
}

export function GiEnvBadge({ env }: { env: GreenInvoiceEnv }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        env === "sandbox"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      )}
    >
      {GI_ENV_LABELS[env]}
    </Badge>
  );
}

/** עוטף שדה ב-<label> (כמו בטפסים במערכת — מאפשר לאתר שדה לפי הכותרת) */
export function GiField({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

/** כפתור פתיחת ה-PDF של המסמך ב-Green Invoice */
export function GiDocumentLinkButton({
  url,
  label,
  size = "sm",
  className,
}: {
  url: string;
  label: string;
  size?: "xs" | "sm" | "default";
  className?: string;
}) {
  return (
    <Button asChild variant="outline" size={size} className={className}>
      <a href={url} target="_blank" rel="noopener noreferrer">
        <FileText aria-hidden />
        {label}
        <ExternalLink className="opacity-60" aria-hidden />
      </a>
    </Button>
  );
}

/** תצוגת PDF מ-base64 (מ-/documents/preview) */
export function GiPdfPreview({
  base64,
  loading,
  error,
  className,
}: {
  base64: string | null;
  loading: boolean;
  error: string | null;
  className?: string;
}) {
  const url = useMemo(() => {
    if (!base64) return null;
    try {
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    } catch {
      return null;
    }
  }, [base64]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return (
    <div
      className={cn(
        "relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-lg border bg-muted/40",
        className
      )}
    >
      {loading ? (
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          טוען תצוגה מקדימה…
        </span>
      ) : error ? (
        <p className="max-w-sm px-4 text-center text-sm text-destructive">{error}</p>
      ) : url ? (
        <>
          <iframe title="תצוגה מקדימה של המסמך" src={url} className="absolute inset-0 size-full bg-white" />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download="preview.pdf"
            className="absolute bottom-2 start-2 inline-flex items-center gap-1 rounded-md border bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          >
            <ExternalLink className="size-3" aria-hidden />
            פתיחת התצוגה בכרטיסייה חדשה
          </a>
        </>
      ) : (
        <p className="px-4 text-center text-sm text-muted-foreground">
          תצוגה מקדימה תופיע כאן (לא צורכת מספר מסמך)
        </p>
      )}
    </div>
  );
}

/** טוסט הצלחה עם קישור ל-PDF (ואזהרה אם יש) */
export function toastIssued(res: { message: string; warning?: string }, url: string | null | undefined) {
  toast.success(res.message, {
    duration: 10_000,
    action: url
      ? { label: "פתיחת PDF", onClick: () => window.open(url, "_blank", "noopener,noreferrer") }
      : undefined,
  });
  if (res.warning) toast.warning(res.warning, { duration: 15_000 });
}

/** טוסט שגיאה; כשהמסמך כבר הופק — עם קישור אליו */
export function toastFailure(res: { message: string; url?: string | null }) {
  toast.error(res.message, {
    duration: 10_000,
    action: res.url
      ? { label: "פתיחת המסמך", onClick: () => window.open(res.url!, "_blank", "noopener,noreferrer") }
      : undefined,
  });
}

export function SummaryRow({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", strong && "font-semibold text-foreground")}>{value}</span>
    </div>
  );
}

export function GiNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
