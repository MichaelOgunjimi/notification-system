"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAnalytics, getUsage } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/shared/empty-state";

export default function UsagePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["usage"],
    queryFn: () => getUsage({ per_page: 200 }),
  });
  const { data: analytics } = useQuery({ queryKey: ["analytics"], queryFn: getAnalytics });

  const totals = useMemo(() => {
    const items = data?.items ?? [];
    const totalCalls = items.reduce((sum, item) => sum + item.request_count, 0);
    const keyMap = new Map<string, number>();
    const hourMap = new Map<string, number>();

    items.forEach((item) => {
      keyMap.set(item.api_key_id, (keyMap.get(item.api_key_id) ?? 0) + item.request_count);
      const hour = new Date(item.hour_bucket).getHours().toString().padStart(2, "0");
      hourMap.set(hour, (hourMap.get(hour) ?? 0) + item.request_count);
    });

    return {
      totalCalls,
      keyRows: Array.from(keyMap.entries()),
      hourRows: Array.from(hourMap.entries()),
    };
  }, [data?.items]);

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
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard label="Total Calls" value={totals.totalCalls.toLocaleString()} />
        <StatCard label="API Keys" value={totals.keyRows.length} />
        <StatCard label="Error Rate" value={`${(100 - (analytics?.success_rate ?? 0)).toFixed(1)}%`} />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">Hourly Usage</h2>
        </div>
        <div className="divide-y divide-[var(--gray-3)]">
          {totals.hourRows.length === 0 ? <EmptyState title="No usage data" description="No usage entries available yet." /> : null}
          {totals.hourRows.map(([hour, count]) => (
            <div key={hour} className="flex items-center justify-between px-4 py-3 sm:px-5">
              <span className="text-[13px] text-[var(--gray-9)]">{hour}:00</span>
              <span className="font-mono text-[13px] text-[var(--gray-7)]">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">API Key Usage</h2>
        </div>
        <div className="divide-y divide-[var(--gray-3)]">
          {totals.keyRows.length === 0 ? <EmptyState title="No key usage data" description="No API key usage available." /> : null}
          {totals.keyRows.map(([apiKeyId, count]) => (
            <div key={apiKeyId} className="grid grid-cols-5 px-4 py-3 sm:px-5">
              <span className="col-span-2 font-mono text-[13px] text-[var(--gray-9)]">{apiKeyId}</span>
              <span className="text-[13px] text-[var(--gray-6)]">-</span>
              <span className="text-[13px] text-[var(--gray-6)]">-</span>
              <span className="font-mono text-[13px] text-[var(--gray-7)]">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
