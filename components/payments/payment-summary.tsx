import { formatIls } from "@/lib/db/format";
import { cn } from "@/lib/utils";

/** סיכום חי: סכום, שויך, נשאר (→ "יישאר כזיכוי ללקוח") */
export function PaymentSummary({
  amount,
  allocated,
  overAllocatedMessage,
  amountLabel = "סכום התשלום",
  allocatedLabel = "שויך לתעודות",
}: {
  amount: number;
  allocated: number;
  overAllocatedMessage?: string | null;
  amountLabel?: string;
  allocatedLabel?: string;
}) {
  const remaining = Math.round((amount - allocated) * 100) / 100;
  const over = remaining < -0.005;

  return (
    <section
      aria-label="סיכום שיוך התשלום"
      className={cn(
        "grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3",
        over ? "border-destructive/60" : "border-border"
      )}
    >
      <div>
        <p className="text-muted-foreground text-xs">{amountLabel}</p>
        <p className="font-semibold tabular-nums text-foreground">
          {formatIls(amount)}
        </p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs">{allocatedLabel}</p>
        <p
          className={cn(
            "font-semibold tabular-nums",
            over ? "text-destructive" : "text-foreground"
          )}
        >
          {formatIls(allocated)}
        </p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs">נשאר לא משויך</p>
        <p
          className={cn(
            "font-semibold tabular-nums",
            over ? "text-destructive" : "text-foreground"
          )}
        >
          {formatIls(Math.max(0, remaining))}
        </p>
        {remaining > 0.005 ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            יישאר כזיכוי ללקוח
          </p>
        ) : !over && amount > 0 ? (
          <p className="text-muted-foreground text-xs">כל הסכום משויך</p>
        ) : null}
      </div>
      {over ? (
        <p className="text-destructive text-sm sm:col-span-3" role="alert">
          {overAllocatedMessage ??
            `סכום השיוך גדול מהסכום הזמין ב-${formatIls(-remaining)}.`}
        </p>
      ) : null}
    </section>
  );
}
