"use client";

import type { ReactNode } from "react";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { PageHeader } from "@/components/page-header";
// import { CrmDemoProvider } from "@/contexts/crm-demo-context";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-h-0">
          <PageHeader />
          {children}
        </SidebarInset>
      </SidebarProvider>
  );
}
