import type { ReactNode } from "react";
import { MessageCircle, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { telHref, whatsAppHref } from "@/lib/memorials/contact";
import { MEM_STAGE_LABELS, type MemStage } from "@/lib/memorials/constants";
import { cn } from "@/lib/utils";

export const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </label>
  );
}

export function Section({
  title,
  actions,
  children,
  className,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function InfoRow({ label, value, ltr }: { label: string; value: ReactNode; ltr?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words" dir={ltr ? "ltr" : undefined} style={ltr ? { textAlign: "right" } : undefined}>
        {value === null || value === undefined || value === "" ? "—" : value}
      </dd>
    </div>
  );
}

export function ContactButtons({
  phone,
  whatsappText,
  size = "default",
}: {
  phone: string | null;
  whatsappText: string;
  size?: "sm" | "default";
}) {
  const tel = telHref(phone);
  const wa = whatsAppHref(phone, whatsappText);
  return (
    <div className="flex flex-wrap gap-2">
      {tel ? (
        <Button size={size} asChild>
          <a href={tel}>
            <Phone />
            התקשרות
          </a>
        </Button>
      ) : null}
      {wa ? (
        <Button size={size} variant="outline" asChild>
          <a href={wa} target="_blank" rel="noopener noreferrer">
            <MessageCircle />
            וואטסאפ
          </a>
        </Button>
      ) : null}
    </div>
  );
}

const STAGE_TONE: Partial<Record<MemStage, string>> = {
  done: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  cancelled: "bg-muted text-muted-foreground",
};

export function StageBadge({ stage }: { stage: MemStage }) {
  return (
    <Badge variant="secondary" className={cn("font-normal", STAGE_TONE[stage])}>
      {MEM_STAGE_LABELS[stage]}
    </Badge>
  );
}
