import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: `middleware` הוחלף ב-`proxy` (הקובץ הישן מסומן deprecated).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
