"use client";

import { Badge } from "@/components/ui/badge";

import { stonesCatalogData } from "./stones-demo-data";

export default function StonesPage() {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-auto">
      <div className="flex flex-1 flex-col p-4 md:p-6">
        <div className="mx-auto w-full max-w-[min(100%,80rem)]">
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {stonesCatalogData.map((stone) => (
              <li key={stone.id}>
                <article className="overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
                  <div
                    className="h-28 w-full border-b border-black/10"
                    style={{ backgroundColor: stone.color }}
                    aria-hidden
                  />
                  <div className="flex flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-base font-semibold text-card-foreground">
                        {stone.name}
                      </h2>
                      {stone.available ? (
                        <Badge variant="secondary" className="shrink-0">
                          זמין
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {stone.polishType}
                    </p>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
