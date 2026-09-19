"use client";

import { RotateCcw } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { listRetryPolicies } from "@/lib/api";
import { cn } from "@/lib/utils";

function BoolPill({ value }: { value: boolean }) {
  return value ? (
    <span className="rounded-full border border-[color:rgba(34,197,94,0.2)] bg-[color:rgba(34,197,94,0.07)] px-2 py-0.5 text-[11px] font-medium text-[var(--status-delivered)]">
      Yes
    </span>
  ) : (
    <span className="rounded-full border border-[var(--gray-3)] bg-[var(--gray-2)] px-2 py-0.5 text-[11px] text-[var(--gray-5)]">
      No
    </span>
  );
}

export default function RetryPoliciesPage() {
  const { data: policies, isLoading, isFetching, error } = useQuery({
    queryKey: ["settings", "retry-policies"],
    queryFn: listRetryPolicies,
    placeholderData: keepPreviousData,
  });

  if (!policies && isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) return <p className="text-sm text-[var(--status-failed)]">Failed to load data</p>;

  return (
    <div
      className={cn(
        "space-y-5",
        "transition-opacity duration-150",
        isFetching && !isLoading && "opacity-60 pointer-events-none",
      )}
    >
      <div className="flex items-start gap-3 rounded-xl border border-blue-500/15 bg-blue-500/5 px-4 py-3.5">
        <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
        <p className="text-[13px] text-[var(--gray-7)]">
          Retry policies use exponential backoff with optional jitter. Workers
          pick up retries via Celery beat scheduling.
        </p>
      </div>

      <div className="space-y-4">
        {policies?.map((p) => (
          <div
            key={p.channel}
            className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-[var(--primary)]" />
                <h2 className="text-sm font-semibold text-[var(--gray-10)]">
                  {p.channel.toUpperCase()}
                </h2>
                <span className="rounded bg-[var(--gray-3)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--gray-6)]">
                  {p.channel}
                </span>
              </div>
              <span className="text-[12px] text-[var(--gray-5)]">
                Up to {p.max_retries} retries
              </span>
            </div>
            <div className="grid grid-cols-2 gap-px bg-[var(--gray-3)] sm:grid-cols-3">
              {[
                { label: "Max Retries", value: p.max_retries },
                { label: "Base Delay", value: `${p.base_delay_seconds}s` },
                { label: "Max Backoff", value: `${p.max_backoff_seconds}s` },
              ].map((stat) => (
                <div key={stat.label} className="bg-[var(--gray-2)] px-4 py-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--gray-5)]">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-[15px] font-semibold tabular-nums text-[var(--gray-10)]">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-3.5 sm:px-5">
              {[
                { label: "Jitter", value: p.jitter_enabled },
                { label: "Timeout retry", value: p.retry_on_timeout },
                { label: "5xx retry", value: p.retry_on_5xx },
                { label: "4xx retry", value: p.retry_on_4xx },
              ].map((flag) => (
                <div key={flag.label} className="flex items-center gap-2">
                  <span className="text-[12px] text-[var(--gray-6)]">
                    {flag.label}
                  </span>
                  <BoolPill value={flag.value} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
