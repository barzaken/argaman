"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { actionCrashed } from "@/lib/action-client";
import { issueCreditNoteForDelivery } from "@/app/dashboard/green-invoice/actions";
import { GiField, toastFailure, toastIssued } from "@/components/green-invoice/shared";

/**
 * "זיכוי" — חשבונית זיכוי (330, linkType "cancel") שמבטלת את החשבונית של התעודה. מנהל בלבד
 * (השרת בודק requireAdmin). אחרי הזיכוי התעודה פנויה להפקת חשבונית מתוקנת.
 *
 * @param deliveryId deliveries.id — רק לתעודה שיש לה green_invoice_id. להציג רק כש-getCurrentCrmUser()?.isAdmin.
 */
export function GreenInvoiceCreditNoteButton({
  deliveryId,
  size = "sm",
  className,
}: {
  deliveryId: string;
  size?: "xs" | "sm" | "default";
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function issue(): Promise<boolean> {
    const res = await issueCreditNoteForDelivery(deliveryId, { reason }).catch(actionCrashed);
    if (!res.ok) {
      toastFailure(res);
      return false;
    }
    toastIssued(res, res.document.url);
    setOpen(false);
    router.refresh();
    return true;
  }

  return (
    <>
      <Button type="button" variant="ghost" size={size} className={className} onClick={() => setOpen(true)}>
        <Undo2 aria-hidden />
        זיכוי
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>חשבונית זיכוי ב-Green Invoice</DialogTitle>
            <DialogDescription>
              מבטלת את החשבונית של התעודה במלואה. אחרי הזיכוי אפשר להפיק לתעודה חשבונית מתוקנת.
            </DialogDescription>
          </DialogHeader>
          <GiField label="סיבת הזיכוי" hint="תופיע בהערות של חשבונית הזיכוי">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} />
          </GiField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={reason.trim().length < 2}
              onClick={() => setConfirmOpen(true)}
            >
              הפקת חשבונית זיכוי
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="להפיק חשבונית זיכוי?"
        description="חשבונית הזיכוי תקבל מספר רץ ב-Green Invoice ותבטל את החשבונית המקורית. לא ניתן לבטל פעולה זו."
        confirmLabel="הפקת זיכוי"
        pendingLabel="מפיק…"
        confirmVariant="destructive"
        onConfirm={issue}
      />
    </>
  );
}
