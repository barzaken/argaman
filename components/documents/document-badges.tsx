import { Badge } from "@/components/ui/badge";
import { documentStatusLabels } from "@/lib/db/labels";
import type { DocumentStatusDb } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/** תג סטטוס מסמך: ממתין לבדיקה (בולט) / טופל / נדחה */
export function DocumentStatusBadge({
  status,
  className,
}: {
  status: DocumentStatusDb;
  className?: string;
}) {
  const variant =
    status === "pending_review"
      ? "default"
      : status === "rejected"
        ? "destructive"
        : "secondary";
  return (
    <Badge variant={variant} className={cn("font-normal", className)}>
      {documentStatusLabels[status] ?? status}
    </Badge>
  );
}
