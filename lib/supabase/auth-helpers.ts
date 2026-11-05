import { createClient } from "@/lib/supabase/server";

export type AuthResult =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; message: string };

export async function requireAuth(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "פג תוקף ההתחברות — רעננו את הדף והתחברו מחדש." };
  return { ok: true, supabase };
}
