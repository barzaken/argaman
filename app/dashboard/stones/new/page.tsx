"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createStone } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { normalizeHex } from "@/lib/db/format";

const POLISH_OPTIONS = ["מבריק", "מט", "למינציה", "מוברש"] as const;

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
  const [polishType, setPolishType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!polishType) return;
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("name", stoneName);
    fd.set("polish_type", polishType);
    fd.set("color_hex", normalizeHex(colorHex));
    const res = await createStone(fd);
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.push("/dashboard/stones");
    router.refresh();
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-background">
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col overflow-auto"
      >
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:items-stretch">
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

              <div className="w-full">
                <Field label="סוג ליטוש">
                  <Select
                    dir="rtl"
                    value={polishType || undefined}
                    onValueChange={setPolishType}
                    required
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="בחר סוג ליטוש" />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {POLISH_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
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

        <div className="sticky bottom-0 z-10 flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-8">
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
        </div>
      </form>
    </div>
  );
}
