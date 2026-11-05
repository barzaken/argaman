"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="crm-enter flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle
        className="size-8 text-zinc-300 dark:text-zinc-600"
        aria-hidden
      />
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">משהו השתבש בטעינת הדף</h2>
        <p className="max-w-sm text-muted-foreground text-sm">
          ייתכן שיש בעיית חיבור זמנית. נסו שוב — ואם זה חוזר, רעננו את הדף.
        </p>
        {error.digest ? (
          <p className="text-muted-foreground/70 text-xs" dir="ltr">
            {error.digest}
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={() => unstable_retry()}>
          <RotateCcw data-icon="inline-start" />
          נסו שוב
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/dashboard">לדאשבורד</Link>
        </Button>
      </div>
    </div>
  );
}
