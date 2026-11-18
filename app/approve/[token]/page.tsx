import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";

import { SignForm } from "./sign-form";

export const metadata: Metadata = {
  title: "אישור נוסח מצבה — ארגמן",
  robots: { index: false, follow: false },
};

type Approval = {
  status: "pending" | "signed" | "cancelled";
  wording: string;
  signed_at: string | null;
  signer_name: string | null;
  order_number: number;
  customer_name: string;
  deceased_name: string | null;
  cemetery: string | null;
  image: string | null;
};

export default async function ApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = /^[0-9a-f]{32,128}$/i.test(token)
    ? await supabase.rpc("mem_get_approval", { p_token: token })
    : { data: null };
  const a = data as Approval | null;

  return (
    <main dir="rtl" className="min-h-dvh bg-stone-50 px-4 py-8 text-stone-900">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="text-center">
          <p className="text-sm tracking-wide text-stone-500">ארגמן מצבות</p>
          <h1 className="text-2xl font-bold">אישור נוסח המצבה</h1>
        </header>
        {!a ? (
          <p className="rounded-xl border bg-white p-6 text-center">הקישור לא נמצא או שאינו בתוקף. נשמח אם תפנו אלינו לקבלת קישור חדש.</p>
        ) : a.status === "cancelled" ? (
          <p className="rounded-xl border bg-white p-6 text-center">הקישור הזה הוחלף בנוסח מעודכן. נא להשתמש בקישור האחרון שקיבלתם.</p>
        ) : (
          <>
            <section className="rounded-xl border bg-white p-6">
              <p className="mb-4 text-sm text-stone-600">
                {a.customer_name} שלום,
                {a.deceased_name ? ` להלן הנוסח למצבה של ${a.deceased_name} ז״ל` : " להלן נוסח המצבה"}
                {a.cemetery ? ` (${a.cemetery})` : ""}. נא לבדוק בעיון כל אות, שם ותאריך.
              </p>
              <p className="whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 p-5 text-center text-xl leading-loose">{a.wording}</p>
            </section>
            {a.image ? (
              <section className="rounded-xl border bg-white p-4">
                <h2 className="mb-2 text-sm font-semibold">הדמיה</h2>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.image} alt="הדמיית המצבה" className="mx-auto max-h-[32rem] w-full object-contain" />
              </section>
            ) : null}
            <section className="rounded-xl border bg-white p-6">
              {a.status === "signed" ? (
                <p className="text-center">
                  הנוסח אושר ונחתם על ידי {a.signer_name}
                  {a.signed_at
                    ? ` ב-${new Intl.DateTimeFormat("he-IL", { dateStyle: "long", timeZone: "Asia/Jerusalem" }).format(new Date(a.signed_at))}`
                    : ""}
                  . תודה.
                </p>
              ) : (
                <SignForm token={token} />
              )}
            </section>
            <p className="text-center text-xs text-stone-500">הזמנה מס׳ {a.order_number}</p>
          </>
        )}
      </div>
    </main>
  );
}
