"use client";

import type { ReactNode } from "react";

import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { PageHeader } from "@/components/page-header";
import {
  CrmRoleProvider,
  type CrmRoleContextValue,
} from "@/components/role-context";
import type { SidebarPreviewData } from "@/lib/data/sidebar-preview";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export function AppShell({
  children,
  user,
  role,
  sidebarPreview,
  memorialsOnly = false,
}: {
  children: ReactNode;
  user: { email: string; name: string };
  role: CrmRoleContextValue;
  sidebarPreview: SidebarPreviewData;
  memorialsOnly?: boolean;
}) {
  return (
    <CrmRoleProvider value={role}>
    <SidebarProvider>
      <AppSidebar user={user} sidebarPreview={sidebarPreview} memorialsOnly={memorialsOnly} />
      <SidebarInset className="min-h-0 overflow-hidden">
        <PageHeader />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
    </CrmRoleProvider>
  );
}
