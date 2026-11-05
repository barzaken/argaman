"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { toHebrewError } from "@/lib/db/errors";

import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email("אימייל לא תקין"),
  password: z.string().min(1, "נא להזין סיסמה"),
});

export type LoginState = { ok: true } | { ok: false; message: string };

export async function loginAction(
  _prev: LoginState | undefined,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאה",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      ok: false,
      message: toHebrewError(error, "ההתחברות נכשלה. נסו שוב."),
    };
  }

  // רק נתיב פנימי תחת /dashboard (מונע open-redirect)
  const next = formData.get("next");
  const target =
    typeof next === "string" &&
    next.startsWith("/dashboard") &&
    !next.startsWith("//")
      ? next
      : "/dashboard";

  revalidatePath("/", "layout");
  redirect(target);
}
