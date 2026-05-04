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
import {
  Box,
  BrickWall,
  ClipboardList,
  Cuboid,
  Gem,
  Layers,
  Mountain,
  Package,
  Sparkles,
  Truck,
} from "lucide-react";
import { NavCollapsible } from "@/components/sidebar/nav-collapsible";
import { NavFooter } from "@/components/sidebar/nav-footer";
import { NavHeader } from "@/components/sidebar/nav-header";
import { NavMain } from "@/components/sidebar/nav-main";
import type { SidebarData } from "./types";
import type { ComponentProps } from "react";

const stonePreview = {
  inStock: [
    {
      id: "stone-jerusalem",
      title: "אבן ירושלמית",
      href: "#",
      icon: BrickWall,
      iconColorClass:
        "text-amber-700 dark:text-amber-400 drop-shadow-[0_0_10px_rgba(180,130,70,0.35)]",
    },
    {
      id: "stone-carrara",
      title: "שיש קרארה",
      href: "#",
      icon: Sparkles,
      iconColorClass:
        "text-stone-200 dark:text-stone-300 drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]",
    },
    {
      id: "stone-travertine",
      title: "טרוורטין",
      href: "#",
      icon: Layers,
      iconColorClass:
        "text-orange-800 dark:text-orange-400 drop-shadow-[0_0_8px_rgba(180,90,40,0.25)]",
    },
    {
      id: "stone-granite",
      title: "גרניט אפור",
      href: "#",
      icon: Cuboid,
      iconColorClass:
        "text-slate-500 dark:text-slate-400 drop-shadow-[0_0_6px_rgba(100,116,139,0.35)]",
    },
  ],
  outOfStock: [
    {
      id: "stone-hebron",
      title: "אבן חברון",
      href: "#",
      icon: Mountain,
      iconColorClass:
        "text-yellow-900 dark:text-yellow-600 drop-shadow-[0_0_8px_rgba(120,80,30,0.3)]",
    },
    {
      id: "stone-turkish",
      title: "שיש טורקי",
      href: "#",
      icon: Gem,
      iconColorClass:
        "text-teal-700 dark:text-teal-400 drop-shadow-[0_0_10px_rgba(20,120,100,0.35)]",
    },
    {
      id: "stone-onyx",
      title: "אוניקס",
      href: "#",
      icon: Gem,
      iconColorClass:
        "text-zinc-800 dark:text-zinc-500 drop-shadow-[0_0_8px_rgba(60,60,70,0.45)]",
    },
  ],
  deliveryOrders: [
    {
      id: "demo-1",
      title: "ת.משלוח — דמו",
      href: "#",
      icon: Truck,
    },
    {
      id: "demo-2",
      title: "ת.משלוח — דמו",
      href: "#",
      icon: Package,
    },
    {
      id: "demo-3",
      title: "ת.משלוח — דמו",
      href: "#",
      icon: Box,
    },
    {
      id: "demo-4",
      title: "ת.משלוח — דמו",
      href: "#",
      icon: ClipboardList,
    },
  ],
};

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const data: SidebarData = {
    user: {
      name: "Nadav Yas",
      email: "nadav@argaman.com",
      avatar: "/avatar-01.png",
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
    navCollapsible: stonePreview,
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
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2 mr-1">
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
