"use client";

import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  CalendarRange,
  CircleDollarSign,
  ClipboardCheck,
  Factory,
  FileWarning,
  LayoutDashboard,
  Package,
  PackageOpen,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";

export type KpiIconName =
  | "layout-dashboard"
  | "file-warning"
  | "circle-dollar-sign"
  | "truck"
  | "factory"
  | "clipboard-check"
  | "package"
  | "calendar"
  | "calendar-range"
  | "package-open"
  | "warehouse"
  | "users";

const KPI_ICONS: Record<KpiIconName, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  "file-warning": FileWarning,
  "circle-dollar-sign": CircleDollarSign,
  truck: Truck,
  factory: Factory,
  "clipboard-check": ClipboardCheck,
  package: Package,
  calendar: Calendar,
  "calendar-range": CalendarRange,
  "package-open": PackageOpen,
  warehouse: Warehouse,
  users: Users,
};

type KpiCardProps = {
  label: string;
  value: number;
  icon: KpiIconName;
};

export function KpiCard({ label, value, icon }: KpiCardProps) {
  const Icon = KPI_ICONS[icon];

  return (
    <section className="flex min-h-[7.5rem] flex-col justify-between border-l border-border bg-background p-5">
      <div className="flex items-center gap-2">
        <Icon
          className="size-5 shrink-0 text-zinc-300 dark:text-zinc-600"
          aria-hidden
        />
        <p className="min-w-0 text-sm leading-snug text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="text-end text-3xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
    </section>
  );
}
