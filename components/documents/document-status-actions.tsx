"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RotateCcw, Trash2, XCircle } from "lucide-react";

import { deleteDocument, setDocumentStatus } from "@/app/dashboard/documents/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { actionCrashed } from "@/lib/action-client";
import type { DocumentStatusDb } from "@/lib/db/types";

/** כפתורי סטטוס: סמן כטופל / דחייה (עם סיבה) / החזר לבדיקה, ומחיקה למנהל */
export function DocumentStatusActions({
  documentId,
  status,
  isAdmin,
}: {
  documentId: string;
  status: DocumentStatusDb;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<DocumentStatusDb | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function changeStatus(next: DocumentStatusDb, why?: string): Promise<boolean> {
    const res = await setDocumentStatus(documentId, next, why).catch(actionCrashed);
    if (!res.ok) {
      toast.error(res.message);
      return false;
    }
    toast.success(
      next === "processed"
        ? "המסמך סומן כטופל"
        : next === "rejected"
          ? "המסמך נדחה"
          : "המסמך הוחזר לבדיקה"
    );
    router.refresh();
    return true;
  }

  async function quick(next: DocumentStatusDb) {
    setBusy(next);
    try {
      await changeStatus(next);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "pending_review" ? (
        <>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() => void quick("processed")}
          >
            {busy === "processed" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 className="size-3.5" aria-hidden />
            )}
            סמן כטופל
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() => setRejectOpen(true)}
          >
            <XCircle className="size-3.5" aria-hidden />
            דחייה
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={busy !== null}
          onClick={() => void quick("pending_review")}
        >
          {busy === "pending_review" ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="size-3.5" aria-hidden />
          )}
          החזר לבדיקה
        </Button>
      )}
      {isAdmin ? (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-destructive hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-3.5" aria-hidden />
          מחיקת מסמך
        </Button>
      ) : null}

      {/* דחייה — עם שדה סיבה שנשמר בהערות */}
      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="דחיית המסמך"
        description="המסמך יסומן כ״נדחה״ והסיבה תישמר בהערות. מסמך שנדחה לא נחשב כפילות, כך שאפשר להזין אותו מחדש."
        confirmLabel="אישור דחייה"
        pendingLabel="דוחה…"
        confirmVariant="destructive"
        onConfirm={async () => {
          const ok = await changeStatus("rejected", reason);
          if (ok) setReason("");
          return ok;
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">סיבת הדחייה</span>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="למשל: צילום לא קריא, מסמך כפול, לא שייך לעסק"
          />
        </label>
      </ConfirmDialog>

      {isAdmin ? (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="מחיקת המסמך"
          description="המסמך והקובץ המצורף יימחקו לצמיתות. לא ניתן לבטל פעולה זו."
          confirmLabel="מחיקה לצמיתות"
          pendingLabel="מוחק…"
          confirmVariant="destructive"
          onConfirm={async () => {
            const res = await deleteDocument(documentId).catch(actionCrashed);
            if (!res.ok) {
              toast.error(res.message);
              return false;
            }
            toast.success("המסמך נמחק");
            router.push("/dashboard/documents");
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
