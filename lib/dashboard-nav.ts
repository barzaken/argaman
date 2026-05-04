import type { LucideIcon } from "lucide-react";
import {
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  ListOrdered,
  Package,
  Truck,
  Users,
  Gem,
} from "lucide-react";

export type DashboardNavMainItem = {
  id: string;
  url: string;
  title: string;
  icon: LucideIcon;
  ctaLabel: string | null;
  /** When set, the page header shows this CTA on the section index route (`url` exactly). */
  headerCtaHref?: string;
  /** If true, used only for page-header / command-palette matching; omitted from the main sidebar list. */
  hideInSidebar?: boolean;
};

export const dashboardNavMain: DashboardNavMainItem[] = [
  {
    id: "dashboard",
    url: "/dashboard",
    title: "דאשבורד",
    icon: LayoutDashboard,
    ctaLabel: "הוסף הזמנה",
  },
  {
    id: "stones",
    url: "/dashboard/stones",
    title: "קטלוג אבן",
    icon: Gem,
    ctaLabel: "אבן חדשה",
    headerCtaHref: "/dashboard/stones/new",
  },
  {
    id: "stones-new",
    url: "/dashboard/stones/new",
    title: "אבן חדשה",
    icon: Gem,
    ctaLabel: null,
    hideInSidebar: true,
  },
  {
    id: "inventory",
    url: "/dashboard/inventory",
    title: "מלאי",
    icon: Package,
    ctaLabel: "הוסף למלאי",
    headerCtaHref: "/dashboard/inventory/new",
  },
  {
    id: "inventory-new",
    url: "/dashboard/inventory/new",
    title: "הוסף למלאי",
    icon: Package,
    ctaLabel: null,
    hideInSidebar: true,
  },
  {
    id: "orders",
    url: "/dashboard/orders",
    title: "תעודות הזמנה",
    icon: FileText,
    ctaLabel: "תעודת הזמנה",
  },
  {
    id: "order-items",
    url: "/dashboard/order-items",
    title: "פריטי הזמנה",
    icon: ListOrdered,
    ctaLabel: null,
  },
  {
    id: "deliveries",
    url: "/dashboard/deliveries",
    title: "תעודות משלוח",
    icon: Truck,
    ctaLabel: "תעודת משלוח",
  },
  {
    id: "customers",
    url: "/dashboard/customers",
    title: "לקוחות",
    icon: Users,
    ctaLabel: "הוסף לקוח",
  },
  {
    id: "debtors",
    url: "/dashboard/debtors",
    title: "רשימת חייבים",
    icon: CircleDollarSign,
    ctaLabel: null,
  },
];

/** Longest matching nav URL wins (e.g. `/dashboard/inventory/new` → מלאי). */
export function getDashboardNavForPath(pathname: string): DashboardNavMainItem | null {
  const normalized = pathname.replace(/\/$/, "") || "/";
  const matches = dashboardNavMain.filter((item) => {
    if (item.url === "/dashboard") return normalized === "/dashboard";
    return normalized === item.url || normalized.startsWith(`${item.url}/`);
  });
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (a.url.length >= b.url.length ? a : b));
}

export function shouldShowNavHeaderCta(
  pathname: string,
  item: DashboardNavMainItem
): boolean {
  if (!item.headerCtaHref || !item.ctaLabel) return false;
  const normalized = pathname.replace(/\/$/, "") || "/";
  return normalized === item.url;
}
