"use client";

import { useQuery } from "@tanstack/react-query";
import { getAdminAnalytics } from "@/lib/api";
import { StatCard } from "@/components/dashboard/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";

export default function AdminAnalyticsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["admin", "analytics"], queryFn: getAdminAnalytics });

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
        <StatCard label="Total Events" value={data?.total_events ?? 0} />
        <StatCard label="Total Notifications" value={data?.total_notifications ?? 0} />
        <StatCard label="Active Keys" value={data?.top_keys.length ?? 0} />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">Channel Breakdown</h2>
        </div>
        <div className="divide-y divide-[var(--gray-3)]">
          {data?.per_channel.length === 0 ? <EmptyState title="No channel data" description="No channel analytics available." /> : null}
          {data?.per_channel.map((channel) => (
            <div key={channel.channel} className="grid grid-cols-4 px-4 py-3 sm:px-5">
              <span className="text-[13px] text-[var(--gray-7)]">{channel.channel}</span>
              <span className="text-[13px] text-[var(--gray-7)]">{channel.total}</span>
              <span className="text-[13px] text-[var(--gray-6)]">N/A</span>
              <span className="text-[13px] text-[var(--gray-6)]">N/A</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">Top Keys</h2>
        </div>
        <div className="divide-y divide-[var(--gray-3)]">
          {data?.top_keys.length === 0 ? <EmptyState title="No key data" description="No key activity available." /> : null}
          {data?.top_keys.map((key) => (
            <div key={key.api_key_id} className="grid grid-cols-4 px-4 py-3 sm:px-5">
              <span className="text-[13px] text-[var(--gray-7)]">{key.key_name}</span>
              <span className="text-[13px] text-[var(--gray-7)]">{key.total_notifications}</span>
              <span className="text-[13px] text-[var(--gray-6)]">N/A</span>
              <span className="text-[13px] text-[var(--gray-6)]">N/A</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
