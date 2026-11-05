import type { LucideIcon } from "lucide-react";
import {
  CircleDollarSign,
  Factory,
  FileSpreadsheet,
  FileStack,
  FileText,
  FolderOpen,
  History,
  LayoutDashboard,
  ListOrdered,
  Package,
  Receipt,
  Settings,
  Truck,
  Users,
  Wallet,
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
    headerCtaHref: "/dashboard/orders/new",
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
    headerCtaHref: "/dashboard/orders/new",
  },
  {
    id: "orders-new",
    url: "/dashboard/orders/new",
    title: "תעודת הזמנה חדשה",
    icon: FileText,
    ctaLabel: null,
    hideInSidebar: true,
  },
  {
    id: "quotes",
    url: "/dashboard/quotes",
    title: "הצעות מחיר",
    icon: FileSpreadsheet,
    ctaLabel: "הצעת מחיר חדשה",
    headerCtaHref: "/dashboard/quotes/new",
  },
  {
    id: "quotes-new",
    url: "/dashboard/quotes/new",
    title: "הצעת מחיר חדשה",
    icon: FileSpreadsheet,
    ctaLabel: null,
    hideInSidebar: true,
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
    ctaLabel: null,
  },
  {
    id: "customers",
    url: "/dashboard/customers",
    title: "לקוחות",
    icon: Users,
    ctaLabel: "הוסף לקוח",
    headerCtaHref: "/dashboard/customers/new",
  },
  {
    id: "customers-new",
    url: "/dashboard/customers/new",
    title: "לקוח חדש",
    icon: Users,
    ctaLabel: null,
    hideInSidebar: true,
  },
  {
    id: "debtors",
    url: "/dashboard/debtors",
    title: "רשימת חייבים",
    icon: CircleDollarSign,
    ctaLabel: null,
  },
  {
    id: "payments",
    url: "/dashboard/payments",
    title: "תשלומים",
    icon: Wallet,
    ctaLabel: "רישום תשלום",
    headerCtaHref: "/dashboard/payments/new",
  },
  {
    id: "payments-new",
    url: "/dashboard/payments/new",
    title: "רישום תשלום",
    icon: Wallet,
    ctaLabel: null,
    hideInSidebar: true,
  },
  {
    id: "documents",
    url: "/dashboard/documents",
    title: "מסמכים",
    icon: FolderOpen,
    ctaLabel: "העלאת מסמך",
    headerCtaHref: "/dashboard/documents/new",
  },
  {
    id: "documents-new",
    url: "/dashboard/documents/new",
    title: "העלאת מסמך",
    icon: FolderOpen,
    ctaLabel: null,
    hideInSidebar: true,
  },
  {
    id: "morning-documents",
    url: "/dashboard/green-invoice/documents",
    title: "מסמכי Morning",
    icon: FileStack,
    ctaLabel: "הפקת מסמך Morning",
    headerCtaHref: "/dashboard/green-invoice/documents/new",
  },
  {
    id: "morning-documents-new",
    url: "/dashboard/green-invoice/documents/new",
    title: "הפקת מסמך Morning",
    icon: FileStack,
    ctaLabel: null,
    hideInSidebar: true,
  },
  {
    id: "suppliers",
    url: "/dashboard/suppliers",
    title: "ספקים",
    icon: Factory,
    ctaLabel: "ספק חדש",
    headerCtaHref: "/dashboard/suppliers/new",
  },
  {
    id: "suppliers-new",
    url: "/dashboard/suppliers/new",
    title: "ספק חדש",
    icon: Factory,
    ctaLabel: null,
    hideInSidebar: true,
  },
  {
    id: "expenses",
    url: "/dashboard/expenses",
    title: "הוצאות",
    icon: Receipt,
    ctaLabel: "הוצאה חדשה",
    headerCtaHref: "/dashboard/expenses/new",
  },
  {
    id: "expenses-new",
    url: "/dashboard/expenses/new",
    title: "הוצאה חדשה",
    icon: Receipt,
    ctaLabel: null,
    hideInSidebar: true,
  },
  {
    id: "activity",
    url: "/dashboard/activity",
    title: "יומן פעולות",
    icon: History,
    ctaLabel: null,
  },
  {
    id: "settings",
    url: "/dashboard/settings",
    title: "הגדרות",
    icon: Settings,
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
