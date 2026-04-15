"use client";

import { useQuery } from "@tanstack/react-query";
import { getAdminHealth } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminHealthPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "health"],
    queryFn: getAdminHealth,
    refetchInterval: 30_000,
  });

  if (isLoading) {
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
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)] px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold text-[var(--gray-10)]">
          {data?.db_connected && data?.redis_connected ? "All Systems Operational" : "Degraded"}
        </h2>
        <p className="mt-1 text-xs text-[var(--gray-6)]">Recent error rate: {data?.error_rate_1h ?? 0}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Object.entries(data?.queue_depths ?? {}).map(([queue, length]) => (
          <div key={queue} className="rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--gray-6)]">{queue}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--gray-10)]">{length}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">Infrastructure</h2>
        </div>
        <div className="divide-y divide-[var(--gray-3)]">
          <div className="flex items-center justify-between px-4 py-3 sm:px-5">
            <span className="text-[13px] text-[var(--gray-7)]">Database</span>
            <span className="text-[13px] text-[var(--gray-7)]">{data?.db_connected ? "Connected" : "Down"}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 sm:px-5">
            <span className="text-[13px] text-[var(--gray-7)]">Redis</span>
            <span className="text-[13px] text-[var(--gray-7)]">{data?.redis_connected ? "Connected" : "Down"}</span>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">Workers</h2>
        </div>
        <div className="px-4 py-3 sm:px-5">
          <p className="text-[13px] text-[var(--gray-7)]">Worker count: {data?.worker_count ?? 0}</p>
        </div>
      </div>
    </div>
  );
}
