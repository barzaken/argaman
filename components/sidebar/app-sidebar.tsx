"use client";

import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/ui/logo";
import { dashboardNavMain } from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";
import { NavCollapsible } from "@/components/sidebar/nav-collapsible";
import { NavFooter } from "@/components/sidebar/nav-footer";
import { NavHeader } from "@/components/sidebar/nav-header";
import { NavMain } from "@/components/sidebar/nav-main";
import type { SidebarData } from "./types";
import type { ComponentProps } from "react";
import type { SidebarPreviewData } from "@/lib/data/sidebar-preview";

export function AppSidebar({
  user,
  sidebarPreview,
  ...props
}: ComponentProps<typeof Sidebar> & {
  user: { email: string; name: string };
  sidebarPreview: SidebarPreviewData;
}) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const data: SidebarData = {
    user: {
      name: user.name,
      email: user.email,
      avatar: "",
    },
    navMain: dashboardNavMain
      .filter((item) => !item.hideInSidebar)
      .map(({ id, url, title, icon, ctaLabel }) => ({
        id,
        url,
        title,
        icon,
        ctaLabel,
      })),
    navCollapsible: {
      inStock: sidebarPreview.inStock,
      outOfStock: sidebarPreview.outOfStock,
      deliveryOrders: sidebarPreview.deliveryOrders,
    },
  };

  return (
    <Sidebar collapsible="icon" side="right" dir="rtl" {...props}>
      <SidebarHeader
        className={cn(
          "border-b border-sidebar-border p-2 md:pt-3.5",
          "gap-2",
          isCollapsed
            ? "flex flex-row items-center justify-between md:flex-col md:items-center md:justify-start md:gap-3"
            : "flex flex-row items-center justify-between"
        )}
      >
        <Link href="/dashboard" className="mr-1 flex min-w-0 items-center gap-2">
          <Logo className="size-8 shrink-0 text-sidebar-foreground" />
          {!isCollapsed && (
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate font-semibold text-sidebar-foreground">
                ארגמן
              </span>
            </span>
          )}
        </Link>
        <div
          className={cn(
            "flex shrink-0 items-center gap-2",
            isCollapsed && "md:flex-col-reverse"
          )}
        >
          <SidebarTrigger />
        </div>
      </SidebarHeader>
      <NavHeader data={data} />
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavCollapsible
          inStock={data.navCollapsible.inStock}
          outOfStock={data.navCollapsible.outOfStock}
          deliveryOrders={data.navCollapsible.deliveryOrders}
        />
      </SidebarContent>
      <NavFooter user={data.user} />
    </Sidebar>
  );
}
