"use client";

import Link from "next/link";
import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DocGroup, DocSearchItem } from "@/lib/docs";

const groupLabels: Record<DocGroup, string> = {
  "getting-started": "Getting Started",
  guides: "Guides",
  reference: "Reference",
};

function scoreResult(item: DocSearchItem, terms: string[]) {
  const title = item.title.toLowerCase();
  const description = item.description.toLowerCase();
  const content = item.content.toLowerCase();

  if (!terms.every((term) => title.includes(term) || description.includes(term) || content.includes(term))) {
    return 0;
  }

  return terms.reduce((score, term) => {
    if (title === term) return score + 60;
    if (title.startsWith(term)) return score + 35;
    if (title.includes(term)) return score + 24;
    if (description.includes(term)) return score + 12;
    return score + 3;
  }, 0);
}

function highlightMatchedTerms(text: string, terms: string[]): ReactNode {
  const normalizedTerms = [...new Set(terms.map((term) => term.toLowerCase()).filter(Boolean))];
  if (!normalizedTerms.length) return text;

  const matches = normalizedTerms.flatMap((term) => {
    const lowered = text.toLowerCase();
    const items: Array<{ start: number; end: number }> = [];
    let index = 0;

    while (index < lowered.length) {
      const matchIndex = lowered.indexOf(term, index);
      if (matchIndex < 0) break;
      items.push({ start: matchIndex, end: matchIndex + term.length });
      index = matchIndex + term.length;
    }

    return items;
  });

  if (!matches.length) return text;

  const orderedMatches = matches
    .sort((a, b) => a.start - b.start)
    .reduce<Array<{ start: number; end: number }>>((merged, match) => {
      const previous = merged.at(-1);
      if (!previous || match.start > previous.end) {
        merged.push(match);
        return merged;
      }

      previous.end = Math.max(previous.end, match.end);
      return merged;
    }, []);

  const parts: ReactNode[] = [];
  let cursor = 0;

  orderedMatches.forEach((match) => {
    if (cursor < match.start) {
      parts.push(text.slice(cursor, match.start));
    }

    parts.push(
      <mark
        key={`${match.start}-${match.end}`}
        className="rounded bg-[var(--docs-accent)]/20 px-0.5 font-semibold text-[var(--docs-ink)]"
      >
        {text.slice(match.start, match.end)}
      </mark>,
    );

    cursor = match.end;
  });

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
}

function resultExcerpt(item: DocSearchItem, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return item.description;

  const matchAt = terms
    .map((term) => item.content.toLowerCase().indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (matchAt === undefined) return item.description;

  const start = Math.max(0, matchAt - 56);
  const end = Math.min(item.content.length, matchAt + 128);
  return `${start > 0 ? "…" : ""}${item.content.slice(start, end).trim()}${end < item.content.length ? "…" : ""}`;
}

export function DocsSearch({
  items,
  open,
  onOpenChange,
}: {
  items: DocSearchItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const terms = useMemo(
    () => query.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );

  const results = useMemo(() => {
    if (terms.length === 0) {
      const preferred = ["quickstart", "events", "api-reference", "architecture"];
      return preferred
        .map((slug) => items.find((item) => item.slug === slug))
        .filter((item): item is DocSearchItem => Boolean(item));
    }

    return items
      .map((item) => ({ item, score: scoreResult(item, terms) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((entry) => entry.item);
  }, [items, terms]);

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  function closeSearch() {
    onOpenChange(false);
    setQuery("");
    setActiveIndex(0);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-[var(--docs-backdrop)] px-3 pt-[8dvh] backdrop-blur-sm sm:px-6 sm:pt-[11dvh]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) closeSearch();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Search Beaco documentation"
        className="mx-auto max-h-[78dvh] w-full max-w-[680px] overflow-hidden rounded-xl border border-[var(--docs-line-strong)] bg-[var(--docs-modal)] shadow-[0_30px_100px_var(--docs-shadow)]"
        onKeyDown={(event) => {
          if (event.key === "Escape") closeSearch();
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (results.length) setActiveIndex((index) => Math.min(index + 1, results.length - 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          }
          if (event.key === "Enter" && results[activeIndex]) {
            window.location.href = `/${results[activeIndex].slug}`;
          }
        }}
      >
        <div className="flex h-16 items-center gap-3 border-b border-[var(--docs-line)] px-5">
          <MagnifyingGlass size={20} className="shrink-0 text-[var(--docs-accent)]" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search guides, APIs, events…"
            aria-label="Search documentation"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-[var(--docs-ink)] outline-none placeholder:text-[var(--docs-muted-faint)]"
          />
          <kbd className="rounded border border-[var(--docs-line-strong)] bg-[var(--docs-control)] px-2 py-1 text-[10px] tracking-wide text-[var(--docs-muted)]">
            ESC
          </kbd>
        </div>

        <div className="max-h-[calc(78dvh-112px)] overflow-y-auto p-2">
          <p className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--docs-muted-faint)]">
            {terms.length ? `${results.length} results` : "Suggested reading"}
          </p>

          {results.length ? (
            <div className="space-y-1">
              {results.map((item, index) => (
                <Link
                  key={item.slug}
                  href={`/${item.slug}`}
                  onClick={closeSearch}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`group grid grid-cols-[minmax(0,1fr)_auto] gap-5 rounded-lg border px-4 py-3.5 transition-colors ${
                    index === activeIndex
                      ? "border-[var(--docs-line-strong)] bg-[var(--docs-control-hover)]"
                      : "border-transparent hover:bg-[var(--docs-control)]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[14px] font-medium text-[var(--docs-ink)]">
                        {highlightMatchedTerms(item.title, terms)}
                      </span>
                      <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--docs-muted-faint)]">
                        {groupLabels[item.group]}
                      </span>
                    </span>
                    <span className="mt-1 block line-clamp-2 text-[12px] leading-5 text-[var(--docs-muted)]">
                      {highlightMatchedTerms(resultExcerpt(item, query), terms)}
                    </span>
                  </span>
                  <ArrowRight size={16} className="mt-1 text-[var(--docs-muted-faint)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--docs-accent)]" aria-hidden />
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-4 py-12 text-center">
              <p className="text-[14px] text-[var(--docs-ink-soft)]">No documentation matched “{query}”.</p>
              <p className="mt-2 text-[12px] text-[var(--docs-muted)]">Try events, retries, channels, or API.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
