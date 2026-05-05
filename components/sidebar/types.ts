import type { ElementType } from "react";

export interface NavItem {
  id: string;
  title: string;
  icon: ElementType;
  url?: string;
  ctaLabel?: string | null;
  isActive?: boolean;
}

export interface User {
  name: string;
  email: string;
  avatar: string;
}

/** מפתח אייקון לפריט תצוגה מ-sidebar (לא מעבירים רכיב React מהשרת). */
export type SidebarPreviewIconKey = "gem" | "package" | "truck";

/** פריט אבן במלאי / לא במלאי — שם + אייקון בצבע האבן */
export interface StoneItem {
  id: string;
  title: string;
  href: string;
  icon: SidebarPreviewIconKey;
  /** מחלקות Tailwind לצביעת האייקון (צבע האבן) */
  iconColorClass?: string;
  /** צבע הקטלוג מהמלאי — לאפשר תצוגת דוגמת צבע */
  colorHex?: string;
}

export interface DeliveryOrderItem {
  id: string;
  title: string;
  href: string;
  icon: SidebarPreviewIconKey;
}

export interface SidebarData {
  user: User;
  navMain: NavItem[];
  navCollapsible: {
    inStock: StoneItem[];
    outOfStock: StoneItem[];
    deliveryOrders: DeliveryOrderItem[];
  };
}
