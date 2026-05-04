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

/** פריט אבן במלאי / לא במלאי — שם + אייקון בצבע האבן */
export interface StoneItem {
  id: string;
  title: string;
  href: string;
  icon: ElementType;
  /** מחלקות Tailwind לצביעת האייקון (צבע האבן) */
  iconColorClass: string;
}

export interface DeliveryOrderItem {
  id: string;
  title: string;
  href: string;
  icon: ElementType;
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
