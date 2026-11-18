"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  convertLeadToOrder,
  deleteLead,
  setLeadStatus,
  updateLeadNotes,
} from "@/app/dashboard/memorials/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCrmRole } from "@/components/role-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { actionCrashed } from "@/lib/action-client";
import {
  MEM_ORDER_KIND_LABELS,
  MEM_ORDER_KINDS,
  type MemLeadStatus,
} from "@/lib/memorials/constants";
import { selectClass } from "./ui";

export function LeadStatusActions({
  leadId,
  status,
  orderId,
  defaultKind,
}: {
  leadId: string;
  status: MemLeadStatus;
  orderId: string | null;
  defaultKind: string;
}) {
  const router = useRouter();
  const { isAdmin } = useCrmRole();
  const [pending, setPending] = useState<string | null>(null);
  const [kind, setKind] = useState(defaultKind);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function run(key: string, fn: () => Promise<{ ok: true } | { ok: false; message: string }>, success: string) {
    setPending(key);
    const res = await fn().catch(actionCrashed);
    setPending(null);
    if (!res.ok) {
      toast.error(res.message);
      return false;
    }
    toast.success(success);
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {status === "new" ? (
          <Button
            variant="secondary"
            disabled={!!pending}
            onClick={() => run("contacted", () => setLeadStatus(leadId, "contacted"), "סומן: דיברנו")}
          >
            {pending === "contacted" ? "שומר…" : "דיברנו איתו"}
          </Button>
        ) : null}
        {status !== "lost" && status !== "converted" ? (
          <Button variant="outline" disabled={!!pending} onClick={() => setLostOpen(true)}>
            לא רלוונטי
          </Button>
        ) : null}
        {status !== "spam" && status !== "converted" ? (
          <Button
            variant="ghost"
            disabled={!!pending}
            onClick={() => run("spam", () => setLeadStatus(leadId, "spam"), "סומן כספאם")}
          >
            ספאם
          </Button>
        ) : null}
        {status === "lost" || status === "spam" ? (
          <Button
            variant="outline"
            disabled={!!pending}
            onClick={() => run("reopen", () => setLeadStatus(leadId, "contacted"), "הליד נפתח מחדש")}
          >
            פתיחה מחדש
          </Button>
        ) : null}
        {isAdmin ? (
          <Button variant="ghost" className="text-destructive" onClick={() => setDeleteOpen(true)}>
            מחיקה
          </Button>
        ) : null}
      </div>

      {orderId ? (
        <Button className="self-start" onClick={() => router.push(`/dashboard/memorials/orders/${orderId}`)}>
          מעבר להזמנה
        </Button>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">סוג הזמנה</span>
            <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}>
              {MEM_ORDER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {MEM_ORDER_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={!!pending}
            onClick={async () => {
              setPending("convert");
              const res = await convertLeadToOrder(leadId, kind).catch(actionCrashed);
              setPending(null);
              if (!res.ok) {
                toast.error(res.message);
                return;
              }
              toast.success("נפתחה הזמנה");
              router.push(`/dashboard/memorials/orders/${res.id}`);
            }}
          >
            {pending === "convert" ? "פותח…" : "פתיחת הזמנה מהליד"}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={lostOpen}
        onOpenChange={setLostOpen}
        title="סימון ליד כלא רלוונטי"
        description="אפשר לכתוב סיבה קצרה (לא חובה)."
        confirmLabel="סימון"
        onConfirm={() => run("lost", () => setLeadStatus(leadId, "lost", lostReason), "הליד סומן כלא רלוונטי")}
      >
        <Input value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="למשל: יקר מדי, כבר הזמין" />
      </ConfirmDialog>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="מחיקת ליד"
        description="הליד והתמונה שלו יימחקו לצמיתות."
        confirmLabel="מחיקה"
        confirmVariant="destructive"
        onConfirm={async () => {
          const res = await deleteLead(leadId).catch(actionCrashed);
          if (!res.ok) {
            toast.error(res.message);
            return false;
          }
          toast.success("הליד נמחק");
          router.push("/dashboard/memorials/leads");
        }}
      />
    </div>
  );
}

export function LeadNotes({ leadId, notes }: { leadId: string; notes: string | null }) {
  const [value, setValue] = useState(notes ?? "");
  const [pending, setPending] = useState(false);
  const dirty = value !== (notes ?? "");
  return (
    <div className="flex flex-col gap-2">
      <Textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} placeholder="מה סוכם בשיחה…" />
      <Button
        variant="outline"
        className="self-start"
        disabled={!dirty || pending}
        onClick={async () => {
          setPending(true);
          const res = await updateLeadNotes(leadId, value).catch(actionCrashed);
          setPending(false);
          if (!res.ok) toast.error(res.message);
          else toast.success("ההערות נשמרו");
        }}
      >
        {pending ? "שומר…" : "שמירת הערות"}
      </Button>
    </div>
  );
}
