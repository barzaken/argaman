"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteExpense } from "@/app/dashboard/expenses/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { actionCrashed } from "@/lib/action-client";

/** מחיקת הוצאה — מוצג רק למנהל (השרת בודק שוב). */
export function ExpenseDeleteButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleDelete() {
    const res = await deleteExpense(id).catch(actionCrashed);
    if (!res.ok) {
      toast.error(res.message);
      return false;
    }
    toast.success("ההוצאה נמחקה");
    router.push("/dashboard/expenses");
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" aria-hidden />
        מחיקת הוצאה
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="למחוק את ההוצאה?"
        description={`${label} תימחק לצמיתות. מסמך מקושר יישאר בארכיון המסמכים.`}
        confirmLabel="מחיקה"
        pendingLabel="מוחק…"
        confirmVariant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
