"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deletePayment } from "../actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { actionCrashed } from "@/lib/action-client";

export function DeletePaymentButton({
  paymentId,
  paymentNumber,
  deliveryNumbers,
}: {
  paymentId: string;
  paymentNumber: number;
  deliveryNumbers: number[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleDelete() {
    const res = await deletePayment(paymentId).catch(actionCrashed);
    if (!res.ok) {
      toast.error(res.message);
      return false;
    }
    toast.success(`תשלום #${paymentNumber} נמחק`);
    router.push("/dashboard/payments");
  }

  const deliveriesText = deliveryNumbers.length
    ? `תעודות המשלוח ${deliveryNumbers.map((n) => `#${n}`).join(", ")} יחזרו להיות ״לא שולם״ (או ״שולם חלקית״) לפי מה שנשאר ששולם עליהן.`
    : "התשלום לא שויך לתעודות, כך שאף תעודה לא תשתנה.";

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Trash2 data-icon="inline-start" />
        מחיקת תשלום
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`מחיקת תשלום #${paymentNumber}`}
        description={`למחוק את התשלום? ${deliveriesText} לא ניתן לבטל את הפעולה.`}
        confirmLabel="מחיקה"
        pendingLabel="מוחק…"
        confirmVariant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
