import { ChevronLeft, ChevronRight } from "lucide-react";

interface TablePaginationProps {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  onPageChange?: (page: number) => void;
}

export function TablePagination({ page, totalPages, total, perPage, onPageChange }: TablePaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  const pages = buildPageNumbers(page, totalPages);

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--gray-3)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-[12px] text-[var(--gray-9)]">
        Showing <span className="font-medium text-[var(--gray-10)]">{from}–{to}</span> of{" "}
        <span className="font-medium text-[var(--gray-10)]">{total.toLocaleString()}</span> results
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange?.(page - 1)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--gray-3)] text-[var(--gray-9)] transition-colors hover:bg-[var(--gray-3)] hover:text-[var(--gray-10)] disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="flex h-7 w-7 items-center justify-center text-[12px] text-[var(--gray-9)]">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange?.(p as number)}
              className={`flex h-7 min-w-[28px] items-center justify-center rounded-md border px-2 text-[12px] font-medium transition-colors ${
                p === page
                  ? "border-[color:rgba(245,158,11,0.3)] bg-[color:rgba(245,158,11,0.1)] text-[var(--primary)]"
                  : "border-[var(--gray-3)] text-[var(--gray-9)] hover:bg-[var(--gray-3)] hover:text-[var(--gray-10)]"
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange?.(page + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--gray-3)] text-[var(--gray-9)] transition-colors hover:bg-[var(--gray-3)] hover:text-[var(--gray-10)] disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function buildPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}
