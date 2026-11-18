"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createManualLead } from "@/app/dashboard/memorials/actions";
import { FormPageShell, FormStickyFooter } from "@/components/form-sticky-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { actionCrashed } from "@/lib/action-client";
import { Field, selectClass } from "./ui";

export function ManualLeadForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const input = Object.fromEntries(fd.entries());
    const res = await createManualLead(input).catch(actionCrashed);
    if (!res.ok) {
      setPending(false);
      setError(res.message);
      toast.error(res.message);
      return;
    }
    toast.success("הליד נשמר");
    router.push(`/dashboard/memorials/leads/${res.id}`);
  }

  return (
    <FormPageShell>
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
            <div>
              <h2 className="text-lg font-semibold">ליד חדש (טלפון / ידני)</h2>
              <p className="text-muted-foreground text-sm">לידים מהאתר נכנסים לבד. כאן מזינים פנייה שהגיעה בטלפון.</p>
            </div>
            <Field label="שם הפונה">
              <Input name="name" required />
            </Field>
            <Field label="טלפון">
              <Input name="phone" dir="ltr" inputMode="tel" className="text-start" />
            </Field>
            <Field label="דוא״ל">
              <Input name="email" type="email" dir="ltr" className="text-start" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="שם הנפטר/ת">
                <Input name="deceased_name" />
              </Field>
              <Field label="תאריך פטירה">
                <Input name="death_date" type="date" />
              </Field>
            </div>
            <Field label="מקור">
              <select name="source" className={selectClass} defaultValue="phone">
                <option value="phone">שיחת טלפון</option>
                <option value="manual">אחר / הפניה</option>
              </select>
            </Field>
            <Field label="מה ביקש">
              <Textarea name="message" rows={4} />
            </Field>
            {error ? <p className="text-destructive text-sm" role="alert">{error}</p> : null}
          </div>
        </div>
        <FormStickyFooter>
          <Button type="button" variant="outline" onClick={() => router.push("/dashboard/memorials/leads")}>
            ביטול
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "שומר…" : "שמירת ליד"}
          </Button>
        </FormStickyFooter>
      </form>
    </FormPageShell>
  );
}
