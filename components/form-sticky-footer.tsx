import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Full-height form page shell — footer sibling stays pinned; content scrolls. */
export function FormPageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Save / action bar pinned to the bottom of FormPageShell (works on mobile). */
export function FormStickyFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "z-20 mt-auto flex shrink-0 flex-wrap items-center gap-3 border-t border-border bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-8",
        "pb-[max(1rem,env(safe-area-inset-bottom))]",
        className
      )}
    >
      {children}
    </div>
  );
}
