"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DateRangeKey, LogFilterValue } from "./log-filters";

/** Selectable page sizes for the log surfaces. */
export const LOG_PER_PAGE_OPTIONS = [10, 25, 50] as const;

const DEFAULT_PER_PAGE = LOG_PER_PAGE_OPTIONS[1];

/** Filter state a log surface persists in the URL query string. */
export type LogUrlState = LogFilterValue &
  Readonly<{ actor: string; page: number; perPage: number }>;

function parseRange(value: string | null): DateRangeKey {
  return value === "24h" ||
    value === "7d" ||
    value === "30d" ||
    value === "custom" ||
    value === "all"
    ? value
    : "all";
}

/**
 * Binds a log surface's filters to the URL query string.
 *
 * The returned `state` is derived from the current query params. `patch` merges
 * a partial update, re-serialises the query, and navigates with
 * `router.replace` so the view survives back-navigation and refresh and stays
 * linkable. Every change except paging and page-size resets to page 1.
 *
 * @returns The current `state` and a `patch` updater.
 */
export function useLogUrlState(): {
  state: LogUrlState;
  patch: (next: Partial<LogUrlState>) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const state = useMemo<LogUrlState>(() => {
    const perPage = Number(params.get("perPage"));
    return {
      project: params.get("project") ?? "",
      actor: params.get("actor") ?? "",
      range: parseRange(params.get("range")),
      from: params.get("from") ?? "",
      to: params.get("to") ?? "",
      action: params.get("action") ?? "",
      page: Math.max(1, Number(params.get("page")) || 1),
      perPage: (LOG_PER_PAGE_OPTIONS as readonly number[]).includes(perPage)
        ? perPage
        : DEFAULT_PER_PAGE,
    };
  }, [params]);

  const patch = useCallback(
    (next: Partial<LogUrlState>) => {
      const merged = { ...state, ...next };
      const pagingOnly = Object.keys(next).every((k) => k === "page" || k === "perPage");
      if (!pagingOnly && next.page === undefined) merged.page = 1;

      const search = new URLSearchParams();
      if (merged.project) search.set("project", merged.project);
      if (merged.actor) search.set("actor", merged.actor);
      if (merged.range !== "all") search.set("range", merged.range);
      if (merged.range === "custom" && merged.from) search.set("from", merged.from);
      if (merged.range === "custom" && merged.to) search.set("to", merged.to);
      if (merged.action) search.set("action", merged.action);
      if (merged.page > 1) search.set("page", String(merged.page));
      if (merged.perPage !== DEFAULT_PER_PAGE) search.set("perPage", String(merged.perPage));

      const query = search.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, state],
  );

  return { state, patch };
}

const PRESET_MS: Record<Exclude<DateRangeKey, "all" | "custom">, number> = {
  "24h": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
};

/**
 * Resolves a range key to its `from`/`to` bounds.
 *
 * A preset's `from` is computed from the current time, so callers must invoke
 * this inside a `useMemo` keyed on the range (and custom dates) — recomputing it
 * every render would produce a new value each time and refetch continuously.
 *
 * @param range The selected range key.
 * @param from Custom lower bound (ISO), used only when `range` is `custom`.
 * @param to Custom upper bound (ISO), used only when `range` is `custom`.
 * @returns The bounds, each `undefined` when unbounded.
 */
export function dateWindowFor(
  range: DateRangeKey,
  from: string,
  to: string,
): { from: string | undefined; to: string | undefined } {
  if (range === "custom") return { from: from || undefined, to: to || undefined };
  if (range === "all") return { from: undefined, to: undefined };
  return { from: new Date(Date.now() - PRESET_MS[range]).toISOString(), to: undefined };
}
