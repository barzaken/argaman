import { createClient } from "@/lib/supabase/server";

/** מגיש תמונה של מצבה (הדמיה / חתימה) למשתמשי CRM מחוברים בלבד (RLS). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("mem_images").select("mime, data").eq("id", id).maybeSingle();
  if (error || !data) return new Response("Not found", { status: 404 });
  const raw = String(data.data ?? "");
  const bytes = raw.startsWith("\\x") ? Buffer.from(raw.slice(2), "hex") : Buffer.from(raw, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": data.mime,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
