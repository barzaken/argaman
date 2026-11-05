"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/zod-he";

import { toHebrewError } from "@/lib/db/errors";
import { requireAdmin } from "@/lib/supabase/auth-helpers";

export type ActionResult = { ok: true } | { ok: false; message: string };

const setRoleSchema = z.object({
  user_id: z.string().uuid("מזהה משתמש לא תקין"),
  role: z.enum(["admin", "agent"]),
  display_name: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(80, "השם ארוך מדי").nullable().optional()
  ),
});

/** שינוי תפקיד (מנהל בלבד; ה-DB מונע הורדה של המנהל האחרון) */
export async function setUserRole(
  raw: z.input<typeof setRoleSchema>
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = setRoleSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה" };
  }

  const { error } = await auth.supabase.rpc("crm_set_user_role", {
    p_user_id: parsed.data.user_id,
    p_role: parsed.data.role,
    p_display_name: parsed.data.display_name ?? null,
  });
  if (error) return { ok: false, message: toHebrewError(error) };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
