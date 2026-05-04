"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { NavItem } from "./types";

function isRouteActive(pathname: string, href: string): boolean {
  const normalized = pathname.replace(/\/$/, "") || "/";
  if (href === "/") return normalized === "/";
  if (href === "/dashboard") return normalized === "/dashboard";
  return normalized === href || normalized.startsWith(`${href}/`);
}

export function NavMain({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) => {
          const Icon = item.icon;
          const href = item.url ?? "#";

          return (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                asChild
                tooltip={item.title}
                isActive={isRouteActive(pathname, href)}
              >
                <Link href={href}>
                  {Icon && <Icon className="me-2 h-4 w-4" />}
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
