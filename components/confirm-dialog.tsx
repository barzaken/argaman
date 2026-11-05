"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * דיאלוג אישור. אם onConfirm מחזיר Promise — הדיאלוג נשאר פתוח עם מצב "טוען"
 * עד שהפעולה מסתיימת (מונע לחיצה כפולה וסגירה באמצע). החזרת false משאירה
 * אותו פתוח (למשל כשהפעולה נכשלה והשגיאה מוצגת בטוסט).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "אישור",
  cancelLabel = "ביטול",
  pendingLabel,
  onConfirm,
  confirmVariant = "default",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pendingLabel?: string;
  onConfirm: () => void | boolean | Promise<void | boolean>;
  confirmVariant?: "default" | "destructive";
}) {
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      const result = await onConfirm();
      if (result !== false) onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent
        dir="rtl"
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            disabled={pending}
            aria-busy={pending}
            onClick={() => void handleConfirm()}
          >
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : null}
            {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
