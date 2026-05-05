import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { buildSidebarPreview } from "@/lib/data/sidebar-preview";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sidebarPreview = await buildSidebarPreview(supabase);

  return (
    <AppShell
      user={{
        email: user.email ?? "",
        name:
          (typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : null) ?? user.email?.split("@")[0] ?? "משתמש",
      }}
      sidebarPreview={sidebarPreview}
    >
      {children}
    </AppShell>
  );
}
