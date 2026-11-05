"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export type CatalogStone = {
  id: string;
  name: string;
  color_hex: string;
  sku: string | null;
  aliases: string[];
  inStock: boolean;
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[״”“]/g, '"')
    .replace(/[׳’‘]/g, "'")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * האם האבן מתאימה לחיפוש — לפי שם, מק״ט או אחד השמות החלופיים.
 * מחזיר false כשאין התאמה, או את השם החלופי שהתאים (null = התאמה בשם / מק״ט).
 */
function matchStone(stone: CatalogStone, q: string): false | string | null {
  if (norm(stone.name).includes(q)) return null;
  if (stone.sku && norm(stone.sku).includes(q)) return null;
  return stone.aliases.find((a) => norm(a).includes(q)) ?? false;
}

export function StonesCatalog({ stones }: { stones: CatalogStone[] }) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);

  const results = useMemo(() => {
    const q = norm(deferred);
    if (!q) return stones.map((s) => ({ stone: s, matchedAlias: null as string | null }));
    const out: { stone: CatalogStone; matchedAlias: string | null }[] = [];
    for (const s of stones) {
      const m = matchStone(s, q);
      if (m === false) continue;
      out.push({ stone: s, matchedAlias: m });
    }
    return out;
  }, [stones, deferred]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-sm sm:w-80">
          <Search
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            role="searchbox"
            aria-label="חיפוש בקטלוג"
            placeholder="חיפוש לפי שם, מק״ט או שם חלופי…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                setQuery("");
              }
            }}
            className="ps-8 pe-8 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute end-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="ניקוי החיפוש"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
        {query ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            {results.length} מתוך {stones.length}
          </p>
        ) : null}
      </div>

      <ul className="grid list-none gap-4 p-0 sm:grid-cols-4 xl:grid-cols-4">
        {results.map(({ stone, matchedAlias }) => (
          <li key={stone.id}>
            <Link
              href={`/dashboard/stones/${stone.id}/edit`}
              className="block overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors hover:bg-muted/30 hover:border-muted-foreground/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div
                className="h-36 w-full border-b border-black/10"
                style={{ backgroundColor: stone.color_hex }}
                aria-hidden
              />
              <div className="flex flex-col gap-1.5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-card-foreground">
                    {stone.name}
                  </h2>
                  {stone.inStock ? (
                    <Badge variant="secondary" className="shrink-0">
                      במלאי
                    </Badge>
                  ) : null}
                </div>
                {stone.sku || stone.aliases.length > 0 ? (
                  <p className="text-muted-foreground line-clamp-2 text-xs">
                    {stone.sku ? (
                      <span dir="ltr" className="tabular-nums">
                        {stone.sku}
                      </span>
                    ) : null}
                    {stone.sku && stone.aliases.length > 0 ? " · " : null}
                    {stone.aliases.length > 0 ? (
                      <span title={stone.aliases.join(", ")}>
                        {matchedAlias ? (
                          <mark className="rounded-sm bg-amber-100 px-0.5 text-foreground dark:bg-amber-500/25">
                            {matchedAlias}
                          </mark>
                        ) : (
                          stone.aliases.slice(0, 3).join(" · ")
                        )}
                        {!matchedAlias && stone.aliases.length > 3
                          ? ` +${stone.aliases.length - 3}`
                          : null}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {stones.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground text-sm">
          אין אבנים בקטלוג. הוסיפו אבן חדשה.
        </p>
      ) : results.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground text-sm">
          לא נמצאה אבן בשם, מק״ט או שם חלופי כזה.
        </p>
      ) : null}
    </div>
  );
}
