import { FileStack } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export type MorningIssueParams = Partial<
  Record<"type" | "customer" | "supplier" | "delivery" | "order" | "quote" | "payment" | "link", string | number | null | undefined>
>;

/** קישור להפקת מסמך Morning (Green Invoice) — הטופס הכללי, עם מילוי מוקדם מהרשומה. */
export function morningIssueHref(params: MorningIssueParams): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  return `/dashboard/green-invoice/documents/new${qs ? `?${qs}` : ""}`;
}

/** כפתור משני (outline) — לא מחליף את כפתורי Green Invoice הקיימים. מחוץ לאזור ההדפסה. */
export function MorningIssueLink({
  params,
  label = "הפקת מסמך Morning",
  className,
}: {
  params: MorningIssueParams;
  label?: string;
  className?: string;
}) {
  return (
    <Button variant="outline" size="sm" className={className} asChild>
      <Link href={morningIssueHref(params)} data-morning-issue="">
        <FileStack data-icon="inline-start" aria-hidden />
        {label}
      </Link>
    </Button>
  );
}
