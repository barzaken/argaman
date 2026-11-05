import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentCrmUser,
  NOT_ALLOWED_MESSAGE,
} from "@/lib/supabase/auth-helpers";
import { buildSidebarPreview } from "@/lib/data/sidebar-preview";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [sidebarPreview, me] = await Promise.all([
    buildSidebarPreview(supabase),
    getCurrentCrmUser(),
  ]);

  return (
    <AppShell
      user={{
        email: user.email ?? "",
        name:
          (typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : null) ?? user.email?.split("@")[0] ?? "משתמש",
      }}
      role={{
        role: me?.role ?? null,
        isAdmin: me?.isAdmin ?? false,
        email: me?.email ?? user.email ?? null,
        userId: me?.userId ?? user.id,
      }}
      sidebarPreview={sidebarPreview}
    >
      {me ? (
        children
      ) : (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="max-w-md rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {NOT_ALLOWED_MESSAGE}
          </p>
        </div>
      )}
    </AppShell>
  );
}
