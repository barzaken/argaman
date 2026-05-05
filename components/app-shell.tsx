"use client";

import type { ReactNode } from "react";

import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { PageHeader } from "@/components/page-header";
import type { SidebarPreviewData } from "@/lib/data/sidebar-preview";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export function AppShell({
  children,
  user,
  sidebarPreview,
}: {
  children: ReactNode;
  user: { email: string; name: string };
  sidebarPreview: SidebarPreviewData;
}) {
  return (
    <SidebarProvider>
      <AppSidebar user={user} sidebarPreview={sidebarPreview} />
      <SidebarInset className="min-h-0">
        <PageHeader />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
