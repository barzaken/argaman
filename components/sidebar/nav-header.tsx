"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import type { SidebarData } from "@/components/sidebar/types";
import { SIDEBAR_PREVIEW_ICONS } from "@/components/sidebar/preview-icons";
import { useSidebar } from "../ui/sidebar";

interface NavHeaderProps {
  data: SidebarData;
}

export function NavHeader({ data }: NavHeaderProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <div className="border-b border-sidebar-border px-2 py-2">
        <div
          className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen(true);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="flex flex-1 items-center gap-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <span className={cn("text-sm font-normal text-muted-foreground", isCollapsed && "hidden")}>
              חפש
            </span>
          </div>
          <div className={cn("flex items-center justify-center rounded-md border border-border px-2 py-1", isCollapsed && "hidden")}>
            <kbd className="inline-flex font-[inherit] text-xs font-medium text-muted-foreground">
              <span className="opacity-70">⌘K</span>
            </kbd>
          </div>
        </div>
      </div>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="חיפוש..." />
        <CommandList>
          <CommandEmpty>לא נמצאו תוצאות</CommandEmpty>
          <CommandGroup heading="ניווט">
            {data.navMain.map((item) => (
              <CommandItem
                className="py-2!"
                key={item.id}
                onSelect={() => {
                  setOpen(false);
                  if (item.url) router.push(item.url);
                }}
              >
                <item.icon className="me-2 h-4 w-4" />
                <span>{item.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator className="my-2" />
          <CommandGroup heading="במלאי">
            {data.navCollapsible.inStock.map((item) => {
              const Icon = SIDEBAR_PREVIEW_ICONS[item.icon];
              return (
                <CommandItem
                  className="py-2!"
                  key={item.id}
                  onSelect={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                >
                  <Icon
                    className={cn(
                      "me-2 h-4 w-4",
                      item.iconColorClass ?? "text-muted-foreground"
                    )}
                  />
                  <span>{item.title}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandSeparator className="my-2" />
          <CommandGroup heading="לא במלאי">
            {data.navCollapsible.outOfStock.map((item) => {
              const Icon = SIDEBAR_PREVIEW_ICONS[item.icon];
              return (
                <CommandItem
                  className="py-2!"
                  key={item.id}
                  onSelect={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                >
                  <Icon
                    className={cn(
                      "me-2 h-4 w-4",
                      item.iconColorClass ?? "text-muted-foreground"
                    )}
                  />
                  <span>{item.title}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandSeparator className="my-2" />
          <CommandGroup heading="תעודות משלוח">
            {data.navCollapsible.deliveryOrders.map((item) => {
              const Icon = SIDEBAR_PREVIEW_ICONS[item.icon];
              return (
                <CommandItem
                  className="py-2!"
                  key={item.id}
                  onSelect={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                >
                  <Icon className="me-2 h-4 w-4" />
                  <span>{item.title}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
