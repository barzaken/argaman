"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  getDashboardNavForPath,
  shouldShowNavHeaderCta,
} from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

export function PageHeader({ className }: { className?: string }) {
  const pathname = usePathname();
  const meta = getDashboardNavForPath(pathname);
  const Icon = meta?.icon ?? LayoutDashboard;
  const title = meta?.title ?? "דאשבורד";
  const showCta =
    meta &&
    shouldShowNavHeaderCta(pathname, meta) &&
    meta.headerCtaHref &&
    meta.ctaLabel;

  return (
    <header
      className={cn(
        "border-b border-sidebar-border p-2 md:pt-3.5",
        "flex shrink-0 items-center gap-2 bg-background",
        className
      )}
    >
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex size-8 items-center justify-center">
          <Icon className="size-4 shrink-0 text-foreground" aria-hidden />
        </div>
        <SidebarTrigger className="shrink-0 sm:hidden" />
      </div>
      <h1 className="min-w-0 flex-1 truncate text-start text-sm font-semibold sm:text-base">
        {title}
      </h1>
      {showCta ? (
        <Button size="sm" className="shrink-0" asChild>
          <Link href={meta.headerCtaHref!}>{meta.ctaLabel}</Link>
        </Button>
      ) : null}
    </header>
  );
}
