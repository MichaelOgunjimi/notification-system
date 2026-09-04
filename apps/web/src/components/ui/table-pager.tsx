"use client";

import "./table-pager.css";

/** Props for {@link TablePager}. */
type TablePagerProps = Readonly<{
  /** Current 1-based page. */
  page: number;
  /** Total number of pages. */
  totalPages: number;
  /** Total number of rows across all pages. */
  total: number;
  /** Current page size. */
  perPage: number;
  /** Page sizes offered by the selector; the selector is shown only with `onPerPageChange`. */
  perPageOptions?: readonly number[];
  /** Requests a page change. */
  onPageChange: (page: number) => void;
  /** Requests a page-size change; omit to hide the per-page selector. */
  onPerPageChange?: (perPage: number) => void;
  /** Disables the controls while a fetch is in flight. */
  busy?: boolean;
}>;

const DEFAULT_PER_PAGE_OPTIONS = [10, 25, 50] as const;

/**
 * Builds a compact page sequence — first page, last page, and a window around
 * the current page — with `"gap"` markers where numbers are skipped.
 *
 * @param current Current 1-based page.
 * @param total Total number of pages.
 * @returns Page numbers interleaved with `"gap"` sentinels.
 */
function pageWindow(current: number, total: number): Array<number | "gap"> {
  if (total <= 7) return Array.from({ length: total }, (_unused, index) => index + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const ordered = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const withGaps: Array<number | "gap"> = [];
  ordered.forEach((page, index) => {
    if (index > 0 && page - ordered[index - 1] > 1) withGaps.push("gap");
    withGaps.push(page);
  });
  return withGaps;
}

/**
 * Shared table footer: a "showing X–Y of N" count, windowed page numbers, and
 * an optional per-page selector. Used by the API keys list and both activity
 * surfaces.
 *
 * @param props Current page state and change handlers.
 * @returns A pagination bar, or `null` when there is nothing to page.
 */
export function TablePager({
  page,
  totalPages,
  total,
  perPage,
  perPageOptions = DEFAULT_PER_PAGE_OPTIONS,
  onPageChange,
  onPerPageChange,
  busy = false,
}: TablePagerProps) {
  if (total === 0) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div className="table-pager">
      <p className="table-pager__count">
        Showing{" "}
        <b>
          {from.toLocaleString()}–{to.toLocaleString()}
        </b>{" "}
        of <b>{total.toLocaleString()}</b> results
      </p>

      <div className="table-pager__right">
        {totalPages > 1 ? (
          <nav className="table-pager__pages" aria-label="Pages">
            <button
              type="button"
              aria-label="Previous page"
              disabled={page <= 1 || busy}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              ‹
            </button>
            {pageWindow(page, totalPages).map((entry, index) =>
              entry === "gap" ? (
                <span key={`gap-${index}`} className="table-pager__gap">
                  …
                </span>
              ) : (
                <button
                  key={entry}
                  type="button"
                  aria-current={entry === page ? "page" : undefined}
                  data-active={entry === page || undefined}
                  disabled={busy}
                  onClick={() => onPageChange(entry)}
                >
                  {entry}
                </button>
              ),
            )}
            <button
              type="button"
              aria-label="Next page"
              disabled={page >= totalPages || busy}
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            >
              ›
            </button>
          </nav>
        ) : null}

        {onPerPageChange ? (
          <label className="table-pager__per-page">
            Per page
            <select
              value={perPage}
              onChange={(event) => onPerPageChange(Number(event.target.value))}
            >
              {perPageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}
