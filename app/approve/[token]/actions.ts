"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

export async function signApproval(input: {
  token: string;
  signerName: string;
  signaturePng: string;
  note: string;
  confirmed: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!input.confirmed) return { ok: false, message: "יש לסמן שקראתם ואישרתם את הנוסח" };
  if (input.signerName.trim().length < 2) return { ok: false, message: "יש למלא שם מלא" };
  if (!input.signaturePng.startsWith("data:image/png;base64,")) return { ok: false, message: "יש לחתום במסגרת" };
  if (input.signaturePng.length > 2_000_000) return { ok: false, message: "החתימה גדולה מדי — נקו ונסו שוב" };
  const h = await headers();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mem_sign_approval", {
    p_token: input.token,
    p_signer_name: input.signerName,
    p_signature_png_base64: input.signaturePng,
    p_note: input.note || null,
    p_user_agent: (h.get("user-agent") ?? "").slice(0, 300),
  });
  if (error) {
    if (/invalid signature/.test(error.message)) return { ok: false, message: "החתימה ריקה — נא לחתום במסגרת" };
    if (/not found/.test(error.message)) return { ok: false, message: "הקישור לא נמצא. פנו אלינו לקבלת קישור חדש." };
    console.error("[approve] sign failed", error.message);
    return { ok: false, message: "השמירה נכשלה. נסו שוב בעוד רגע." };
  }
  const res = data as { ok: boolean; status: string } | null;
  if (!res?.ok) {
    return { ok: false, message: res?.status === "signed" ? "הנוסח כבר נחתם. תודה!" : "הקישור כבר לא בתוקף. פנו אלינו לקבלת קישור חדש." };
  }
  return { ok: true };
}
