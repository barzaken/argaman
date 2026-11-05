import { Skeleton } from "@/components/ui/skeleton";

/**
 * מוצג מיד בלחיצה על קישור, עד שהשרת מחזיר את הדף.
 * מופיע בהשהיה קצרה (crm-delayed-fade) — בניווט מהיר הוא לא "מהבהב" בכלל.
 */
export default function DashboardLoading() {
  return (
    <div
      className="crm-delayed-fade flex h-[calc(100dvh-3.5rem)] flex-col"
      role="status"
      aria-live="polite"
      aria-label="טוען…"
    >
      <div className="grid grid-cols-2 border-b xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-[7.5rem] flex-col justify-between border-b border-l border-border p-5"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ms-auto h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4 md:p-6">
        <div className="mx-auto flex w-full max-w-[min(100%,80rem)] flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-8 w-full max-w-sm" />
            <Skeleton className="h-8 w-20" />
          </div>
          <div className="overflow-hidden rounded-md border bg-card">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b px-3 py-3 last:border-b-0"
              >
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="hidden h-4 w-24 sm:block" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">טוען…</span>
    </div>
  );
}
