import { MorningDocumentForm } from "@/components/green-invoice/document-form/morning-document-form";
import { isGreenInvoiceConfigured, resolveGreenInvoiceEnv } from "@/lib/green-invoice/config";
import { israelToday } from "@/lib/green-invoice/mappers";
import { getCurrentCrmUser } from "@/lib/supabase/auth-helpers";
import { createClient } from "@/lib/supabase/server";

import { buildPrefill, loadParties } from "../prefill";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * הפקת מסמך Morning מכל סוג. פרמטרים למילוי מראש:
 * ?type=305&customer=<id>&supplier=<id>&delivery=<id>&order=<id>&quote=<id>&payment=<id>&link=<מזהה מסמך Morning>
 */
export default async function NewMorningDocumentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [parties, me] = await Promise.all([loadParties(supabase), getCurrentCrmUser()]);
  const prefill = await buildPrefill(supabase, sp, parties);
  // מפתח לפי הפרמטרים — ניווט לאותו דף עם פרמטרים אחרים מאפס את הטופס
  const key = JSON.stringify(sp);

  return (
    <MorningDocumentForm
      key={key}
      prefill={prefill}
      customers={parties.customers}
      suppliers={parties.suppliers}
      role={me?.role ?? "agent"}
      configured={isGreenInvoiceConfigured()}
      env={resolveGreenInvoiceEnv()}
      today={israelToday()}
    />
  );
}
