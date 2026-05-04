'use client';

import { LucideIcon } from "lucide-react";

type KpiCardProps = {
    label: string;
    value: number;
    Icon: LucideIcon;
};

export function KpiCard({ label, value, Icon }: KpiCardProps) {
    return (
        <section className="flex min-h-[7.5rem] flex-col justify-between border-l border-border bg-background p-5">
            <div className="flex items-center gap-2">
                <Icon
                    className="size-5 shrink-0 text-zinc-300 dark:text-zinc-600"
                    aria-hidden
                />
                <p className="min-w-0 text-sm leading-snug text-muted-foreground">
                    {label}
                </p>
            </div>
            <p className="text-end text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                {value}
            </p>
        </section>
    );
}
