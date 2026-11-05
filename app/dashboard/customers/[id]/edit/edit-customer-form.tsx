"use client";

import { toast } from "sonner";
import { actionCrashed } from "@/lib/action-client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateCustomer } from "../../actions";
import {
  FormPageShell,
  FormStickyFooter,
} from "@/components/form-sticky-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CustomerRow } from "@/lib/db/types";

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // <label> עוטף את השדה — שם נגיש לקורא מסך ולחיצה על הכותרת מפעילה את השדה
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

export function EditCustomerForm({ customer }: { customer: CustomerRow }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("id", customer.id);
    const res = await updateCustomer(fd).catch(actionCrashed);
    if (!res.ok) {
      setPending(false);
      setError(res.message);
      return;
    }
    toast.success("פרטי הלקוח עודכנו");
    router.push(`/dashboard/customers/${customer.id}`);
  }

  return (
    <FormPageShell>
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                עריכת לקוח
              </h2>
            </div>
            <Field label="שם">
              <Input name="name" required defaultValue={customer.name} />
            </Field>
            <Field label="ח.פ / ת״ז">
              <Input
                name="tax_id"
                dir="ltr"
                className="text-start"
                required
                defaultValue={customer.tax_id}
              />
            </Field>
            <Field label="דוא״ל">
              <Input
                name="email"
                type="email"
                dir="ltr"
                className="text-start"
                defaultValue={customer.email ?? ""}
              />
            </Field>
            <Field label="טלפון">
              <Input
                name="phone"
                dir="ltr"
                className="text-start"
                defaultValue={customer.phone ?? ""}
              />
            </Field>
            <Field label="כתובת">
              <Textarea
                name="address"
                rows={3}
                defaultValue={customer.address ?? ""}
              />
            </Field>
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <FormStickyFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/customers/${customer.id}`)}
          >
            ביטול
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "שומר…" : "שמירה"}
          </Button>
        </FormStickyFooter>
      </form>
    </FormPageShell>
  );
}
