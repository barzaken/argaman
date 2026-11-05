"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { allocatePayment } from "../actions";
import { AllocationEditor } from "@/components/payments/allocation-editor";
import {
  checkAllocations,
  type OpenDelivery,
} from "@/components/payments/allocation-utils";
import { PaymentSummary } from "@/components/payments/payment-summary";
import { Button } from "@/components/ui/button";
import { actionCrashed } from "@/lib/action-client";
import { formatIls } from "@/lib/db/format";

/** "שיוך יתרה": שיוך הזיכוי הלא משויך של התשלום לתעודות פתוחות של הלקוח */
export function AllocateRemaining({
  paymentId,
  unallocated,
  deliveries,
}: {
  paymentId: string;
  unallocated: number;
  deliveries: OpenDelivery[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = checkAllocations(deliveries, values);
  const over = check.allocated > unallocated + 0.005;
  const overMessage = over
    ? `סכום השיוך (${formatIls(check.allocated)}) גדול מהזיכוי הלא משויך (${formatIls(unallocated)}).`
    : null;

  async function handleSave() {
    setError(null);
    const firstError =
      Object.values(check.rowErrors)[0] ??
      overMessage ??
      (check.allocations.length === 0
        ? "הזינו סכום לשיוך לפחות לתעודה אחת (או לחצו ״שיוך אוטומטי״)."
        : null);
    if (firstError) {
      setError(firstError);
      toast.error(firstError);
      return;
    }
    setPending(true);
    const res = await allocatePayment({
      payment_id: paymentId,
      allocations: check.allocations,
    }).catch(actionCrashed);
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      toast.error(res.message);
      router.refresh();
      return;
    }
    toast.success(`שויכו ${formatIls(check.allocated)} לתעודות`);
    setValues({});
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4" aria-label="שיוך יתרה">
      <div>
        <h2 className="text-sm font-semibold text-foreground">שיוך יתרה</h2>
        <p className="text-muted-foreground text-xs">
          לתשלום נשאר זיכוי לא משויך של {formatIls(unallocated)}. אפשר לשייך
          אותו לתעודות פתוחות נוספות של הלקוח.
        </p>
      </div>
      <AllocationEditor
        deliveries={deliveries}
        values={values}
        onChange={setValues}
        rowErrors={check.rowErrors}
        amountToAllocate={unallocated}
        disabled={pending}
        emptyText="אין ללקוח תעודות משלוח פתוחות — הזיכוי יישאר ללקוח."
      />
      <PaymentSummary
        amount={unallocated}
        allocated={check.allocated}
        amountLabel="זיכוי זמין לשיוך"
        allocatedLabel="משויך עכשיו"
        overAllocatedMessage={overMessage}
      />
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-start">
        <Button
          type="button"
          disabled={pending || deliveries.length === 0}
          onClick={() => void handleSave()}
        >
          {pending ? "שומר…" : "שמירת שיוך"}
        </Button>
      </div>
    </section>
  );
}
