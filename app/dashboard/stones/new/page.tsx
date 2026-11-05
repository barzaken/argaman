"use client";

import { toast } from "sonner";
import { actionCrashed } from "@/lib/action-client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createStone } from "../actions";
import {
  FormPageShell,
  FormStickyFooter,
} from "@/components/form-sticky-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeHex } from "@/lib/db/format";
import { AliasesInput } from "../aliases-input";

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

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-1 flex-col justify-center gap-5 px-4 py-6 md:px-8",
        className
      )}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function NewStonePage() {
  const router = useRouter();
  const [colorHex, setColorHex] = useState("#57534e");
  const [stoneName, setStoneName] = useState("");
  const [sku, setSku] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("name", stoneName);
    fd.set("color_hex", normalizeHex(colorHex));
    fd.set("sku", sku.trim());
    fd.set("aliases", JSON.stringify(aliases));
    const res = await createStone(fd).catch(actionCrashed);
    if (!res.ok) {
      setPending(false);
      setError(res.message);
      return;
    }
    toast.success("האבן נוספה לקטלוג");
    router.push("/dashboard/stones");
  }

  return (
    <FormPageShell>
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:items-stretch">
          <div className="flex min-h-0 w-full flex-col lg:w-[min(100%,26rem)] lg:shrink-0 lg:border-e lg:border-border xl:w-[min(100%,28rem)]">
            <Section title="פרטי אבן" className="flex-none justify-start py-6">
              <div className="flex w-full flex-col gap-5 sm:flex-row sm:items-end">
                <div className="flex shrink-0 flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">צבע</span>
                  <input
                    type="color"
                    value={normalizeHex(colorHex).slice(0, 7)}
                    onChange={(e) => setColorHex(e.target.value)}
                    className="size-14 cursor-pointer overflow-hidden rounded-xl border border-border bg-background p-1 shadow-sm [&::-moz-color-swatch]:rounded-lg [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-0"
                    aria-label="בחירת צבע"
                  />
                </div>
                <Field label="שם האבן" className="min-w-0 flex-1">
                  <Input
                    value={stoneName}
                    onChange={(e) => setStoneName(e.target.value)}
                    placeholder="לדוגמה: גרניט שחור"
                    required
                  />
                </Field>
              </div>

              <Field label="מק״ט">
                <Input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  dir="ltr"
                  className="text-start"
                  placeholder="לא חובה"
                />
              </Field>
              <AliasesInput
                label="שמות חלופיים"
                value={aliases}
                onChange={setAliases}
                hint="השמות שספקים ולקוחות כותבים על המסמכים (למשל ״ירושלמי לבן״, ״JW-30״) — כך האבן תימצא גם לפיהם."
              />

              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
            </Section>
          </div>

          <div
            className="hidden min-h-0 shrink-0 lg:block lg:flex-1"
            aria-hidden
          />
        </div>

        <FormStickyFooter className="justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard/stones")}
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
