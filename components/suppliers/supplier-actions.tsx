"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteSupplier, setSupplierActive } from "@/app/dashboard/suppliers/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { actionCrashed } from "@/lib/action-client";

export function SupplierActions({
  id,
  name,
  isActive,
  isAdmin,
}: {
  id: string;
  name: string;
  isActive: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleArchive() {
    const res = await setSupplierActive(id, !isActive).catch(actionCrashed);
    if (!res.ok) {
      toast.error(res.message);
      return false;
    }
    toast.success(isActive ? "הספק הועבר לארכיון" : "הספק הוחזר לרשימת הפעילים");
    router.refresh();
  }

  async function handleDelete() {
    const res = await deleteSupplier(id).catch(actionCrashed);
    if (!res.ok) {
      toast.error(res.message);
      return false;
    }
    toast.success("הספק נמחק");
    router.push("/dashboard/suppliers");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" className="gap-1.5" asChild>
        <Link href={`/dashboard/suppliers/${id}/edit`}>
          <Pencil className="size-3.5" aria-hidden />
          עריכת ספק
        </Link>
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        type="button"
        onClick={() => setArchiveOpen(true)}
      >
        {isActive ? (
          <Archive className="size-3.5" aria-hidden />
        ) : (
          <ArchiveRestore className="size-3.5" aria-hidden />
        )}
        {isActive ? "העברה לארכיון" : "החזרה מארכיון"}
      </Button>
      {isAdmin ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-destructive"
          type="button"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-3.5" aria-hidden />
          מחיקת ספק
        </Button>
      ) : null}

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={isActive ? "להעביר את הספק לארכיון?" : "להחזיר את הספק?"}
        description={
          isActive
            ? `"${name}" לא יופיע ברשימות הבחירה. ההוצאות והמלאי שלו נשמרים.`
            : `"${name}" יחזור לרשימת הספקים הפעילים.`
        }
        confirmLabel={isActive ? "העברה לארכיון" : "החזרה"}
        pendingLabel="שומר…"
        onConfirm={handleArchive}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="למחוק את הספק?"
        description={`"${name}" יימחק לצמיתות. אפשר למחוק רק ספק שאין לו הוצאות, מלאי או מסמכים.`}
        confirmLabel="מחיקה"
        pendingLabel="מוחק…"
        confirmVariant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
