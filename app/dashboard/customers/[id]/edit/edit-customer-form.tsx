"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateCustomer } from "../../actions";
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
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
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
    const res = await updateCustomer(fd);
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.push(`/dashboard/customers/${customer.id}`);
    router.refresh();
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-auto bg-background">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-lg flex-col gap-6 p-4 md:p-8"
      >
        <div>
          <h2 className="text-lg font-semibold text-foreground">עריכת לקוח</h2>
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
        <div className="flex flex-wrap gap-2">
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
        </div>
      </form>
    </div>
  );
}
