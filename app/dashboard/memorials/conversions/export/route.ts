import { createClient } from "@/lib/supabase/server";
import { conversionsCsv, loadConversions } from "@/lib/memorials/conversions";

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days")) || 90, 1), 365);
  const rows = await loadConversions(supabase, new Date(Date.now() - days * 86400_000).toISOString());
  return new Response(conversionsCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="argaman-memorial-conversions.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
