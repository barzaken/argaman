"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";

import { markLeadsReported } from "@/app/dashboard/memorials/actions";
import { Button } from "@/components/ui/button";
import { actionCrashed } from "@/lib/action-client";

export function MarkReportedButton({ ids, label }: { ids: string[]; label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (!ids.length) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      data-testid="mark-reported"
      onClick={async () => {
        setPending(true);
        const res = await markLeadsReported(ids).catch(actionCrashed);
        setPending(false);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        toast.success(ids.length === 1 ? "סומן כדווח" : `${ids.length} לידים סומנו כדווחו`);
        router.refresh();
      }}
    >
      <CheckCheck />
      {pending ? "מסמן…" : label ?? (ids.length === 1 ? "סמן כדווח" : "סמן הכל כדווח")}
    </Button>
  );
}
