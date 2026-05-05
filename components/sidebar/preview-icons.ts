import { Gem, Package, Truck, type LucideIcon } from "lucide-react";

import type { SidebarPreviewIconKey } from "@/components/sidebar/types";

/** Maps serialized sidebar preview keys to Lucide icons (client-only usage). */
export const SIDEBAR_PREVIEW_ICONS: Record<
  SidebarPreviewIconKey,
  LucideIcon
> = {
  gem: Gem,
  package: Package,
  truck: Truck,
};
