"use client";

import Link from "next/link";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import type { DeliveryOrderItem, StoneItem } from "@/components/sidebar/types";

interface NavCollapsibleProps {
  inStock: StoneItem[];
  outOfStock: StoneItem[];
  deliveryOrders: DeliveryOrderItem[];
}

function StoneCollapsible({ label, items }: { label: string; items: StoneItem[] }) {
  if (!items.length) return null;

  return (
    <Collapsible className="group/collapsible">
      <SidebarGroup>
        <SidebarGroupLabel
          asChild
          className="text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <CollapsibleTrigger>
            {label}
            <ChevronDown className="ms-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton asChild>
                      <Link href={item.href} className="flex items-center gap-3">
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            item.iconColorClass
                          )}
                          aria-hidden
                        />
                        <span className="truncate">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

export function NavCollapsible({
  inStock,
  outOfStock,
  deliveryOrders,
}: NavCollapsibleProps) {
  return (
    <div className="space-y-0">
      <StoneCollapsible label="במלאי" items={inStock} />
      <StoneCollapsible label="לא במלאי" items={outOfStock} />

      {deliveryOrders.length > 0 && (
        <Collapsible className="group/collapsible">
          <SidebarGroup>
            <SidebarGroupLabel
              asChild
              className="text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <CollapsibleTrigger>
                תעודות משלוח
                <ChevronDown className="ms-auto size-4 transition-transform group-data-[state=closed]/collapsible:rotate-0 group-data-[state=open]/collapsible:rotate-180" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {deliveryOrders.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton asChild>
                          <Link href={item.href} className="flex items-center gap-3">
                            <Icon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      )}
    </div>
  );
}
