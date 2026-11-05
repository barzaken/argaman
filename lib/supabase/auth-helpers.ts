import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CrmRoleDb } from "@/lib/db/types";

export type CrmRole = CrmRoleDb;

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export type AuthResult =
  | {
      ok: true;
      supabase: ServerSupabase;
      userId: string;
      email: string | null;
      /** 'admin' = מנהל (כל הפעולות), 'agent' = סוכן / בוט (בלי מחיקות) */
      role: CrmRole;
      isAdmin: boolean;
    }
  | { ok: false; message: string };

export const SESSION_EXPIRED_MESSAGE = "פג תוקף ההתחברות — רעננו את הדף והתחברו מחדש.";
export const NOT_ALLOWED_MESSAGE = "המשתמש אינו מורשה לגשת למערכת. פנו למנהל המערכת.";
export const ADMIN_ONLY_MESSAGE = "פעולה זו מותרת למנהל בלבד";

/**
 * מחזיר את תפקיד המשתמש מ-public.crm_user_role() (SECURITY DEFINER).
 * null = מחובר אבל לא ברשימת crm_users.
 * אם הפונקציה עוד לא קיימת (patch-2026-11-documents-payments.sql לא הורץ) —
 * מתנהגים כמו קודם: כל משתמש מחובר הוא מנהל.
 */
async function fetchRole(supabase: ServerSupabase): Promise<CrmRole | null> {
  const { data, error } = await supabase.rpc("crm_user_role");
  if (error) {
    console.error("[auth] crm_user_role failed — falling back to admin:", error.message);
    return "admin";
  }
  if (data === "admin" || data === "agent") return data;
  return null;
}

export async function requireAuth(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: SESSION_EXPIRED_MESSAGE };

  const role = await fetchRole(supabase);
  if (!role) return { ok: false, message: NOT_ALLOWED_MESSAGE };

  return {
    ok: true,
    supabase,
    userId: user.id,
    email: user.email ?? null,
    role,
    isAdmin: role === "admin",
  };
}

/** כמו requireAuth, אבל סוכן (role = agent) מקבל "פעולה זו מותרת למנהל בלבד". */
export async function requireAdmin(): Promise<AuthResult> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  if (auth.role !== "admin") return { ok: false, message: ADMIN_ONLY_MESSAGE };
  return auth;
}

/**
 * לשימוש ב-Server Components (למשל להסתיר כפתורי מחיקה מסוכן):
 * `const me = await getCurrentCrmUser(); me?.isAdmin`
 * ממוטמן לכל בקשה (React cache).
 */
export const getCurrentCrmUser = cache(async () => {
  const auth = await requireAuth();
  if (!auth.ok) return null;
  return { userId: auth.userId, email: auth.email, role: auth.role, isAdmin: auth.isAdmin };
});
