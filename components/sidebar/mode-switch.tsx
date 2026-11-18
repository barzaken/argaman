"use client";

import Link from "next/link";
import { Building2, Flower2 } from "lucide-react";

import type { DashboardMode } from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";

/** מעבר בין מצב קבלנים (B2B) למצב מצבות (לקוחות פרטיים) */
export function ModeSwitch({ mode, collapsed }: { mode: DashboardMode; collapsed: boolean }) {
  const items = [
    { mode: "contractors" as const, href: "/dashboard", label: "קבלנים", Icon: Building2 },
    { mode: "memorials" as const, href: "/dashboard/memorials", label: "מצבות", Icon: Flower2 },
  ];
  if (collapsed) {
    const other = items.find((i) => i.mode !== mode)!;
    return (
      <div className="flex justify-center px-2 pt-2">
        <Link
          href={other.href}
          title={`מעבר למצב ${other.label}`}
          className="flex size-8 items-center justify-center rounded-md border border-sidebar-border text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
        >
          <other.Icon className="size-4" />
        </Link>
      </div>
    );
  }
  return (
    <div className="px-2 pt-2">
      <div role="tablist" aria-label="מצב מערכת" className="grid grid-cols-2 gap-1 rounded-lg bg-sidebar-accent/60 p-1">
        {items.map((i) => (
          <Link
            key={i.mode}
            href={i.href}
            role="tab"
            aria-selected={mode === i.mode}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              mode === i.mode
                ? "bg-sidebar text-sidebar-foreground shadow-sm"
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
            )}
          >
            <i.Icon className="size-3.5" />
            {i.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
