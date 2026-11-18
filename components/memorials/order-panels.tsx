"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Copy, ExternalLink, ImagePlus, MessageCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  addPayment,
  addReminder,
  cancelApproval,
  completeReminder,
  createApproval,
  deleteImage,
  deleteOrder,
  deletePayment,
  issueMorningDocument,
  setOrderStage,
  uploadOrderImage,
} from "@/app/dashboard/memorials/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCrmRole } from "@/components/role-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { actionCrashed } from "@/lib/action-client";
import { approvalWhatsAppText, whatsAppHref } from "@/lib/memorials/contact";
import {
  MEM_DOC_TYPE_LABELS,
  MEM_PAYMENT_METHOD_LABELS,
  MEM_PAYMENT_METHODS,
  MEM_PIPELINE_STAGES,
  MEM_STAGE_LABELS,
  memImageUrl,
  type MemDocType,
  type MemStage,
} from "@/lib/memorials/constants";
import { formatDateShort, formatIls, todayIsoInIsrael } from "@/lib/db/format";
import { cn } from "@/lib/utils";
import { Field, selectClass } from "./ui";

type Res = { ok: true } | { ok: false; message: string };

function useRun() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  async function run(key: string, fn: () => Promise<Res>, success?: string): Promise<boolean> {
    setPending(key);
    const res = await fn().catch(actionCrashed);
    setPending(null);
    if (!res.ok) {
      toast.error(res.message);
      return false;
    }
    if (success) toast.success(success);
    router.refresh();
    return true;
  }
  return { pending, run, router };
}

// ---------------------------------------------------------------------------
// שלבים
// ---------------------------------------------------------------------------
export function StageStepper({ orderId, stage }: { orderId: string; stage: MemStage }) {
  const { pending, run, router } = useRun();
  const { isAdmin } = useCrmRole();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const idx = MEM_PIPELINE_STAGES.indexOf(stage);
  const next = idx >= 0 && idx < MEM_PIPELINE_STAGES.length - 1 ? MEM_PIPELINE_STAGES[idx + 1] : stage === "installation" ? "done" : null;

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-wrap gap-1.5">
        {MEM_PIPELINE_STAGES.map((s, i) => {
          const active = s === stage;
          const passed = stage === "done" || (idx >= 0 && i < idx);
          return (
            <li key={s}>
              <button
                type="button"
                disabled={!!pending || stage === "cancelled"}
                onClick={() => run(s, () => setOrderStage(orderId, s), `השלב עודכן: ${MEM_STAGE_LABELS[s]}`)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  active && "border-primary bg-primary text-primary-foreground",
                  !active && passed && "border-primary/40 bg-primary/10 text-foreground",
                  !active && !passed && "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                {i + 1}. {MEM_STAGE_LABELS[s]}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        {next && stage !== "cancelled" ? (
          <Button size="sm" disabled={!!pending} onClick={() => run(next, () => setOrderStage(orderId, next), `השלב עודכן: ${MEM_STAGE_LABELS[next]}`)}>
            העברה ל{MEM_STAGE_LABELS[next]}
          </Button>
        ) : null}
        {stage === "cancelled" || stage === "done" ? (
          <Button size="sm" variant="outline" disabled={!!pending} onClick={() => run("reopen", () => setOrderStage(orderId, "call"), "ההזמנה נפתחה מחדש")}>
            פתיחה מחדש
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={!!pending} onClick={() => setCancelOpen(true)}>
            ביטול הזמנה
          </Button>
        )}
        {isAdmin ? (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteOpen(true)}>
            מחיקה
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="ביטול הזמנה"
        description="אם הלקוח כבר שילם, אחרי הביטול אפשר להפיק חשבונית זיכוי."
        confirmLabel="ביטול ההזמנה"
        confirmVariant="destructive"
        onConfirm={() => run("cancel", () => setOrderStage(orderId, "cancelled", reason), "ההזמנה בוטלה")}
      >
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="סיבת הביטול" />
      </ConfirmDialog>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="מחיקת הזמנה"
        description="ההזמנה, התשלומים, התמונות והאישורים שלה יימחקו לצמיתות."
        confirmLabel="מחיקה"
        confirmVariant="destructive"
        onConfirm={async () => {
          const res = await deleteOrder(orderId).catch(actionCrashed);
          if (!res.ok) {
            toast.error(res.message);
            return false;
          }
          toast.success("ההזמנה נמחקה");
          router.push("/dashboard/memorials/orders");
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// תמונות
// ---------------------------------------------------------------------------
async function fileToJpegBase64(file: File): Promise<{ base64: string; mime: string }> {
  const bitmap = await createImageBitmap(file);
  const max = 1800;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
  return { base64: dataUrl.split(",")[1] ?? "", mime: "image/jpeg" };
}

export type ImageItem = { id: string; kind: string; created_at: string };

const IMAGE_KIND_LABELS: Record<string, string> = {
  design: "עיצוב מהאתר",
  render: "הדמיה",
  signature: "חתימה",
  other: "תמונה",
};

export function OrderImages({ orderId, images }: { orderId: string; images: ImageItem[] }) {
  const { pending, run } = useRun();
  const inputRef = useRef<HTMLInputElement>(null);
  const visible = images.filter((i) => i.kind !== "signature");
  return (
    <div className="flex flex-col gap-3">
      {visible.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {visible.map((img) => (
            <figure key={img.id} className="group relative overflow-hidden rounded-lg border border-border bg-muted/30">
              <a href={memImageUrl(img.id)} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={memImageUrl(img.id)} alt={IMAGE_KIND_LABELS[img.kind] ?? "תמונה"} className="aspect-[4/3] w-full object-contain" />
              </a>
              <figcaption className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-muted-foreground">
                <span>
                  {IMAGE_KIND_LABELS[img.kind] ?? "תמונה"} · {formatDateShort(img.created_at)}
                </span>
                <button
                  type="button"
                  className="text-destructive opacity-70 hover:opacity-100"
                  aria-label="מחיקת תמונה"
                  disabled={!!pending}
                  onClick={() => run(img.id, () => deleteImage(img.id, orderId), "התמונה נמחקה")}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">אין עדיין תמונות.</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const img = await fileToJpegBase64(file);
            await run("upload", () => uploadOrderImage(orderId, { ...img, kind: "render" }), "ההדמיה הועלתה");
          } catch {
            toast.error("לא הצלחנו לקרוא את התמונה");
          }
        }}
      />
      <Button size="sm" variant="outline" className="self-start" disabled={!!pending} onClick={() => inputRef.current?.click()}>
        <ImagePlus />
        {pending === "upload" ? "מעלה…" : "העלאת הדמיה"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// אישור נוסח
// ---------------------------------------------------------------------------
export type ApprovalItem = {
  id: string;
  token: string;
  status: "pending" | "signed" | "cancelled";
  created_at: string;
  signed_at: string | null;
  signer_name: string | null;
  wording: string;
};

export function ApprovalPanel({
  orderId,
  customerName,
  phone,
  wording,
  images,
  approvals,
  publicBaseUrl,
}: {
  orderId: string;
  customerName: string;
  phone: string | null;
  wording: string | null;
  images: ImageItem[];
  approvals: ApprovalItem[];
  publicBaseUrl: string;
}) {
  const { pending, run } = useRun();
  const candidates = images.filter((i) => i.kind !== "signature");
  const [text, setText] = useState(wording ?? "");
  const [imageId, setImageId] = useState<string>(
    candidates.find((i) => i.kind === "render")?.id ?? candidates[0]?.id ?? ""
  );
  const open = approvals.find((a) => a.status === "pending");
  const signed = approvals.filter((a) => a.status === "signed");
  const linkFor = (token: string) => `${publicBaseUrl}/approve/${token}`;

  return (
    <div className="flex flex-col gap-4">
      {signed.map((a) => (
        <div key={a.id} className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
          <p className="font-medium">
            נחתם ע״י {a.signer_name} ב-{formatDateShort(a.signed_at)}
          </p>
          <a className="text-primary underline underline-offset-4" href={`/dashboard/memorials/approvals/${a.id}`}>
            צפייה והדפסה של האישור החתום
          </a>
        </div>
      ))}

      {open ? (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <p className="font-medium">ממתין לחתימת המשפחה (נשלח {formatDateShort(open.created_at)})</p>
          <code className="break-all text-xs" dir="ltr">
            {linkFor(open.token)}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(linkFor(open.token));
                toast.success("הקישור הועתק");
              }}
            >
              <Copy />
              העתקת קישור
            </Button>
            {whatsAppHref(phone, "") ? (
              <Button size="sm" asChild>
                <a href={whatsAppHref(phone, approvalWhatsAppText(customerName, linkFor(open.token)))!} target="_blank" rel="noopener noreferrer">
                  <MessageCircle />
                  שליחה בוואטסאפ
                </a>
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" asChild>
              <a href={linkFor(open.token)} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                תצוגה
              </a>
            </Button>
            <Button size="sm" variant="ghost" disabled={!!pending} onClick={() => run("cancel", () => cancelApproval(open.id, orderId), "הבקשה בוטלה")}>
              ביטול הבקשה
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <Field label={open ? "שליחת נוסח מעודכן (מבטל את הקישור הקודם)" : "נוסח לאישור המשפחה"}>
          <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"פה נטמן\n...\nתנצב״ה"} />
        </Field>
        {candidates.length ? (
          <Field label="הדמיה שתוצג למשפחה">
            <select className={selectClass} value={imageId} onChange={(e) => setImageId(e.target.value)}>
              <option value="">בלי תמונה</option>
              {candidates.map((i) => (
                <option key={i.id} value={i.id}>
                  {IMAGE_KIND_LABELS[i.kind] ?? "תמונה"} · {formatDateShort(i.created_at)}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <p className="text-muted-foreground text-xs">כדאי להעלות הדמיה לפני השליחה, כדי שהמשפחה תאשר גם אותה.</p>
        )}
        <Button
          size="sm"
          className="self-start"
          disabled={!!pending || text.trim().length < 2}
          onClick={() =>
            run(
              "create",
              async () => {
                const res = await createApproval(orderId, { wording: text, imageId: imageId || null });
                if (res.ok) {
                  try {
                    await navigator.clipboard.writeText(linkFor(res.token));
                  } catch {
                    /* ignore */
                  }
                }
                return res;
              },
              "נוצר קישור לאישור (הועתק)"
            )
          }
        >
          {pending === "create" ? "יוצר…" : "יצירת קישור לאישור וחתימה"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// תשלומים + מסמכי Morning
// ---------------------------------------------------------------------------
export type PaymentItem = {
  id: string;
  amount: number;
  method: string;
  paid_at: string;
  is_deposit: boolean;
  note: string | null;
  document_id: string | null;
};

export type DocItem = {
  id: string;
  doc_type: number;
  amount: number;
  morning_number: string | null;
  url: string | null;
  status: string;
  created_at: string;
  description: string | null;
};

export function PaymentsPanel({ orderId, payments }: { orderId: string; payments: PaymentItem[] }) {
  const { pending, run } = useRun();
  const { isAdmin } = useCrmRole();
  const [form, setForm] = useState({
    amount: "",
    method: "transfer",
    paid_at: todayIsoInIsrael(),
    is_deposit: payments.length === 0,
    note: "",
  });

  return (
    <div className="flex flex-col gap-3">
      {payments.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="tabular-nums font-medium">{formatIls(Number(p.amount))}</span>
              <span className="text-muted-foreground">
                {MEM_PAYMENT_METHOD_LABELS[p.method as keyof typeof MEM_PAYMENT_METHOD_LABELS] ?? p.method} · {formatDateShort(p.paid_at)}
                {p.is_deposit ? " · מקדמה" : ""}
                {p.note ? ` · ${p.note}` : ""}
                {p.document_id ? " · הופק מסמך" : ""}
              </span>
              {isAdmin && !p.document_id ? (
                <button
                  type="button"
                  aria-label="מחיקת תשלום"
                  className="text-destructive opacity-70 hover:opacity-100"
                  disabled={!!pending}
                  onClick={() => run(p.id, () => deletePayment(p.id, orderId), "התשלום נמחק")}
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">עוד לא נרשמו תשלומים.</p>
      )}
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run("add", () => addPayment(orderId, form), "התשלום נרשם");
          if (ok) setForm((f) => ({ ...f, amount: "", note: "", is_deposit: false }));
        }}
      >
        <Field label="סכום">
          <Input required inputMode="decimal" dir="ltr" className="text-start" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </Field>
        <Field label="אמצעי">
          <select className={selectClass} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            {MEM_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {MEM_PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="תאריך">
          <Input type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} />
        </Field>
        <Button type="submit" size="sm" disabled={!!pending}>
          {pending === "add" ? "שומר…" : "רישום תשלום"}
        </Button>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={form.is_deposit} onChange={(e) => setForm({ ...form, is_deposit: e.target.checked })} />
          זו מקדמה
        </label>
        <Input className="sm:col-span-2" placeholder="הערה (לא חובה)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </form>
    </div>
  );
}

export function MorningDocsPanel({
  orderId,
  stage,
  hasEmail,
  defaultDescription,
  price,
  paidTotal,
  payments,
  docs,
  morningConfigured,
}: {
  orderId: string;
  stage: MemStage;
  hasEmail: boolean;
  defaultDescription: string;
  price: number | null;
  paidTotal: number;
  payments: PaymentItem[];
  docs: DocItem[];
  morningConfigured: boolean;
}) {
  const { pending, run } = useRun();
  const { isAdmin } = useCrmRole();
  const allowCredit = isAdmin && stage === "cancelled" && paidTotal > 0;
  const types: MemDocType[] = [300, 305, 320, 400, ...(allowCredit ? [330 as const] : [])];
  const openPayments = payments.filter((p) => !p.document_id);
  const [docType, setDocType] = useState<MemDocType>(openPayments.length ? 320 : 300);
  const [paymentId, setPaymentId] = useState(openPayments[0]?.id ?? "");
  const [amount, setAmount] = useState(
    openPayments[0] ? String(openPayments[0].amount) : price ? String(price) : ""
  );
  const [description, setDescription] = useState(defaultDescription);
  const [method, setMethod] = useState("transfer");
  const [sendEmail, setSendEmail] = useState(hasEmail);
  const needsPayment = docType === 320 || docType === 400;

  return (
    <div className="flex flex-col gap-3">
      {docs.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="font-medium">
                {MEM_DOC_TYPE_LABELS[d.doc_type as MemDocType] ?? d.doc_type}
                {d.morning_number ? ` ${d.morning_number}` : ""}
              </span>
              <span className="tabular-nums">{formatIls(Number(d.amount))}</span>
              <span className={cn("text-xs", d.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                {d.status === "issued" ? formatDateShort(d.created_at) : d.status === "failed" ? `נכשל: ${d.description ?? ""}` : "בהפקה…"}
              </span>
              {d.url ? (
                <a className="text-primary text-xs underline underline-offset-4" href={d.url} target="_blank" rel="noopener noreferrer">
                  פתיחת המסמך
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!morningConfigured ? (
        <p className="text-muted-foreground text-sm">Morning לא מחובר בסביבה הזו.</p>
      ) : (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await run(
              "issue",
              () =>
                issueMorningDocument(orderId, {
                  doc_type: docType,
                  amount,
                  description,
                  payment_id: needsPayment ? paymentId || null : null,
                  method: needsPayment && !paymentId ? method : null,
                  send_email: sendEmail,
                }),
              "המסמך הופק ב-Morning"
            );
          }}
        >
          <Field label="סוג מסמך">
            <select className={selectClass} value={docType} onChange={(e) => setDocType(Number(e.target.value) as MemDocType)}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {MEM_DOC_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          {needsPayment ? (
            <Field label="עבור תשלום">
              <select
                className={selectClass}
                value={paymentId}
                onChange={(e) => {
                  setPaymentId(e.target.value);
                  const p = openPayments.find((x) => x.id === e.target.value);
                  if (p) setAmount(String(p.amount));
                }}
              >
                {openPayments.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatIls(Number(p.amount))} · {formatDateShort(p.paid_at)}
                  </option>
                ))}
                <option value="">תשלום שלא נרשם (אמצעי ידני)</option>
              </select>
            </Field>
          ) : (
            <div />
          )}
          {needsPayment && !paymentId ? (
            <Field label="אמצעי תשלום">
              <select className={selectClass} value={method} onChange={(e) => setMethod(e.target.value)}>
                {MEM_PAYMENT_METHODS.filter((m) => m !== "cheque").map((m) => (
                  <option key={m} value={m}>
                    {MEM_PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="סכום (כולל מע״מ)">
            <Input required inputMode="decimal" dir="ltr" className="text-start" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="תיאור בשורה" className="sm:col-span-2">
            <Input required value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sendEmail} disabled={!hasEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            {hasEmail ? "לשלוח ללקוח במייל" : "אין מייל ללקוח — לא יישלח"}
          </label>
          <Button type="submit" size="sm" className="justify-self-start" disabled={!!pending}>
            {pending === "issue" ? "מפיק…" : `הפקת ${MEM_DOC_TYPE_LABELS[docType]}`}
          </Button>
          {docType === 330 ? (
            <p className="text-muted-foreground text-xs sm:col-span-2">הזיכוי יקושר לחשבונית המס האחרונה של ההזמנה.</p>
          ) : null}
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// תזכורות
// ---------------------------------------------------------------------------
export function ReminderDoneButton({ id }: { id: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="outline" disabled={!!pending} onClick={() => run("done", () => completeReminder(id), "סומן כבוצע")}>
      {pending ? "…" : "בוצע"}
    </Button>
  );
}

export function AddReminderForm({ orderId, leadId }: { orderId?: string; leadId?: string }) {
  const { pending, run } = useRun();
  const [due, setDue] = useState(todayIsoInIsrael());
  const [title, setTitle] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run("add", () => addReminder({ orderId, leadId }, { due_date: due, title }), "התזכורת נוספה");
        if (ok) setTitle("");
      }}
    >
      <Input type="date" className="w-40" value={due} onChange={(e) => setDue(e.target.value)} />
      <Input className="min-w-48 flex-1" placeholder="למשל: לחזור למשפחה אחרי החגים" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Button type="submit" size="sm" variant="outline" disabled={!!pending || title.trim().length < 2}>
        הוספת תזכורת
      </Button>
    </form>
  );
}
