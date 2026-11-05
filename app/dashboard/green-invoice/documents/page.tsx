import Link from "next/link";
import { FilePlus2 } from "lucide-react";

import { GiEnvBadge, GiNotConnectedLink } from "@/components/green-invoice/shared";
import { Button } from "@/components/ui/button";
import { toHebrewError } from "@/lib/db/errors";
import type { DocumentViewRow } from "@/lib/db/types";
import { isGreenInvoiceConfigured, resolveGreenInvoiceEnv } from "@/lib/green-invoice/config";
import { createClient } from "@/lib/supabase/server";

import { MorningDocumentsView } from "./morning-documents-view";

const LIMIT = 400;

/** מסמכי Morning: מה שהופק מהמערכת (documents.source = green_invoice) + חיפוש ישיר ב-Morning */
export default async function MorningDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab === "morning" ? "morning" : "issued";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents_view")
    .select("*")
    .eq("source", "green_invoice")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  const configured = isGreenInvoiceConfigured();

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
        <div className="mx-auto flex w-full max-w-[min(100%,80rem)] flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground">
                מסמכי Morning
                {configured ? <GiEnvBadge env={resolveGreenInvoiceEnv()} /> : null}
              </h2>
              <p className="text-sm text-muted-foreground">
                כל סוגי המסמכים — הצעות מחיר, הזמנות, תעודות משלוח, חשבוניות, קבלות, זיכויים, פיקדונות ותרומות
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!configured ? <GiNotConnectedLink /> : null}
              <Button asChild className="gap-1.5">
                <Link href="/dashboard/green-invoice/documents/new">
                  <FilePlus2 className="size-4" aria-hidden />
                  הפקת מסמך Morning
                </Link>
              </Button>
            </div>
          </div>
          {error ? (
            <p className="text-sm text-destructive">{toHebrewError(error, "טעינת המסמכים נכשלה. נסו לרענן את הדף.")}</p>
          ) : (
            <MorningDocumentsView rows={(data ?? []) as DocumentViewRow[]} tab={tab} configured={configured} truncatedAt={LIMIT} />
          )}
        </div>
      </div>
    </div>
  );
}
