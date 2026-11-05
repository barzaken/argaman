"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createSupplier, updateSupplier } from "@/app/dashboard/suppliers/actions";
import {
  FormPageShell,
  FormStickyFooter,
} from "@/components/form-sticky-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { actionCrashed } from "@/lib/action-client";
import type { SupplierRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // <label> עוטף את השדה — שם נגיש לקורא מסך ולחיצה על הכותרת מפעילה את השדה
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </label>
  );
}

export function SupplierForm({ supplier }: { supplier?: SupplierRow }) {
  const router = useRouter();
  const isEdit = Boolean(supplier);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: string; name: string } | null>(null);
  const [pending, setPending] = useState(false);

  const backHref = supplier ? `/dashboard/suppliers/${supplier.id}` : "/dashboard/suppliers";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setExisting(null);
    const fd = new FormData(e.currentTarget);
    const input = {
      name: String(fd.get("name") ?? ""),
      tax_id: String(fd.get("tax_id") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      email: String(fd.get("email") ?? ""),
      address: String(fd.get("address") ?? ""),
      notes: String(fd.get("notes") ?? ""),
    };
    const res = await (supplier
      ? updateSupplier(supplier.id, input)
      : createSupplier(input)
    ).catch(actionCrashed);
    if (!res.ok) {
      setPending(false);
      setError(res.message);
      if ("existing" in res && res.existing) setExisting(res.existing);
      toast.error(res.message);
      return;
    }
    toast.success(isEdit ? "פרטי הספק עודכנו" : "הספק נוסף");
    router.push(`/dashboard/suppliers/${res.id}`);
  }

  return (
    <FormPageShell>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {isEdit ? `עריכת ספק: ${supplier?.name}` : "ספק חדש"}
              </h2>
              <p className="text-muted-foreground text-sm">
                מחצבה, מוביל, מוסך או כל גורם שמוציא לנו חשבוניות
              </p>
            </div>
            <Field label="שם הספק">
              <Input name="name" required defaultValue={supplier?.name ?? ""} />
            </Field>
            <Field
              label="ח.פ / ע.מ"
              hint="מומלץ למלא — כך המערכת מזהה את הספק במסמכים ומונעת כפילויות"
            >
              <Input
                name="tax_id"
                dir="ltr"
                inputMode="numeric"
                className="text-start"
                defaultValue={supplier?.tax_id ?? ""}
              />
            </Field>
            <Field label="טלפון">
              <Input
                name="phone"
                dir="ltr"
                className="text-start"
                defaultValue={supplier?.phone ?? ""}
              />
            </Field>
            <Field label="דוא״ל">
              <Input
                name="email"
                type="email"
                dir="ltr"
                className="text-start"
                defaultValue={supplier?.email ?? ""}
              />
            </Field>
            <Field label="כתובת">
              <Textarea name="address" rows={2} defaultValue={supplier?.address ?? ""} />
            </Field>
            <Field label="הערות">
              <Textarea name="notes" rows={3} defaultValue={supplier?.notes ?? ""} />
            </Field>
            {error ? (
              <div className="flex flex-wrap items-center gap-2 text-sm" role="alert">
                <span className="text-destructive">{error}</span>
                {existing ? (
                  <Link
                    href={`/dashboard/suppliers/${existing.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    מעבר לספק הקיים
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <FormStickyFooter>
          <Button type="button" variant="outline" onClick={() => router.push(backHref)}>
            ביטול
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "שומר…" : isEdit ? "שמירת שינויים" : "שמירת ספק"}
          </Button>
        </FormStickyFooter>
      </form>
    </FormPageShell>
  );
}
