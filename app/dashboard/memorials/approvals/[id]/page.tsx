import { notFound } from "next/navigation";

import { PrintButton } from "@/components/memorials/print-button";
import { createClient } from "@/lib/supabase/server";
import { memImageUrl } from "@/lib/memorials/constants";

function dt(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jerusalem" }).format(new Date(iso));
}

/** עותק מודפס של אישור נוסח חתום — לתיוק בהזמנה */
export default async function ApprovalRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("mem_approvals")
    .select("id, status, wording, image_id, created_at, signed_at, signer_name, signer_note, signature_image_id, signer_user_agent, order_id, mem_orders(number, customer_name, deceased_name, cemetery, grave_location)")
    .eq("id", id)
    .maybeSingle();
  if (!a) notFound();
  const o = (Array.isArray(a.mem_orders) ? a.mem_orders[0] : a.mem_orders) as {
    number: number;
    customer_name: string;
    deceased_name: string | null;
    cemetery: string | null;
    grave_location: string | null;
  } | null;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-auto bg-muted/30 p-4 print:h-auto print:overflow-visible print:bg-white print:p-0">
      <div className="mx-auto mb-3 flex w-full max-w-3xl justify-end print:hidden">
        <PrintButton />
      </div>
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-5 rounded-xl border border-border bg-white p-8 text-black print:border-0">
        <header className="flex flex-col gap-1 border-b pb-4">
          <h1 className="text-xl font-bold">אישור נוסח והדמיה — ארגמן מצבות</h1>
          <p className="text-sm">
            הזמנה #{o?.number} · {o?.customer_name}
            {o?.deceased_name ? ` · לעילוי נשמת ${o.deceased_name}` : ""}
            {o?.cemetery ? ` · ${o.cemetery}` : ""}
            {o?.grave_location ? ` (${o.grave_location})` : ""}
          </p>
        </header>
        <section>
          <h2 className="mb-2 text-sm font-semibold">הנוסח שאושר</h2>
          <p className="whitespace-pre-wrap rounded-lg border p-4 text-center text-lg leading-relaxed">{a.wording}</p>
        </section>
        {a.image_id ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold">ההדמיה שאושרה</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={memImageUrl(a.image_id)} alt="הדמיית המצבה" className="mx-auto max-h-[28rem] object-contain" />
          </section>
        ) : null}
        <section className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div className="text-sm">
            <p>סטטוס: {a.status === "signed" ? "נחתם" : a.status === "pending" ? "ממתין לחתימה" : "בוטל"}</p>
            <p>נשלח: {dt(a.created_at)}</p>
            <p>נחתם: {dt(a.signed_at)}</p>
            <p>שם החותם/ת: {a.signer_name ?? "—"}</p>
            {a.signer_note ? <p>הערת המשפחה: {a.signer_note}</p> : null}
            {a.signer_user_agent ? <p className="mt-2 text-[10px] text-gray-500" dir="ltr">{a.signer_user_agent}</p> : null}
          </div>
          {a.signature_image_id ? (
            <div>
              <p className="mb-1 text-sm">חתימה:</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={memImageUrl(a.signature_image_id)} alt="חתימה" className="h-28 border-b object-contain" />
            </div>
          ) : null}
        </section>
      </article>
    </div>
  );
}
