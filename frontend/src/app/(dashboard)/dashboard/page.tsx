"use client";

import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Mail,
  Send,
  Webhook,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { getAnalytics, listNotifications } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

export default function DashboardPage() {
  const analyticsQuery = useQuery({
    queryKey: ["analytics"],
    queryFn: getAnalytics,
  });
  const notificationsQuery = useQuery({
    queryKey: ["notifications", { per_page: 5 }],
    queryFn: () => listNotifications({ per_page: 5 }),
  });

  if (analyticsQuery.isLoading || notificationsQuery.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (analyticsQuery.error || notificationsQuery.error) {
    return <p className="text-sm text-[var(--status-failed)]">Failed to load data</p>;
  }

  const analytics = analyticsQuery.data;
  const recentActivity =
    notificationsQuery.data?.items.map((n) => ({
      id: n.id,
      title: `${n.channel} → ${n.recipient_address}`,
      channel: n.channel,
      target: n.recipient_address,
      status: n.status,
      time: formatRelativeTime(n.updated_at),
    })) ?? [];
  const channelHealth =
    analytics?.channel_stats?.map((ch) => {
      const total = ch.delivered + ch.failed + ch.pending + ch.dead_letter;
      const pct = total > 0 ? Math.round((ch.delivered / total) * 100) : 0;
      return {
        label: ch.channel.toUpperCase(),
        value: `${total > 0 ? ((ch.delivered / total) * 100).toFixed(1) : "0.0"}%`,
        volume: `${total} sent`,
        pct,
        icon: ch.channel === "email" ? Mail : ch.channel === "sms" ? Bell : Webhook,
      };
    }) ?? [];
  const notificationsQueued = analytics?.notifications_queued ?? 0;
  const notificationsProcessing = analytics?.notifications_processing ?? 0;
  const notificationsDelivered = analytics?.notifications_delivered ?? 0;
  const queueSnapshot = [
    { label: "Queued", value: String(notificationsQueued), color: "text-[var(--gray-10)]" },
    { label: "Retrying", value: String(notificationsProcessing), color: "text-[#fdba74]" },
    { label: "Dead Letter", value: String(analytics?.dlq_active ?? 0), color: "text-[#fca5a5]" },
  ];

  return (
    <div className="space-y-5">

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Events Today"
          value={(analytics?.events_today ?? 0).toLocaleString()}
          icon={<Activity className="h-3.5 w-3.5 text-[#60a5fa]" />}
        />
        <StatCard
          label="Delivery Rate"
          value={(analytics?.events_today ?? 0) === 0 ? "N/A" : `${(analytics?.success_rate ?? 100).toFixed(1)}%`}
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-[#4ade80]" />}
        />
        <StatCard
          label="Retry Queue"
          value={String(notificationsQueued + notificationsProcessing)}
          icon={<Send className="h-3.5 w-3.5 text-[#fbbf24]" />}
        />
        <StatCard
          label="Dead Letters"
          value={String(analytics?.dlq_active ?? 0)}
          icon={<AlertTriangle className="h-3.5 w-3.5 text-[#f87171]" />}
        />
      </div>

      {/* ── Main content row ── */}
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">

        {/* Recent activity */}
        <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--gray-3)] px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--gray-10)]">Recent Delivery Activity</h2>
              <p className="mt-0.5 text-xs text-[var(--gray-6)]">Latest notifications across all channels.</p>
            </div>
            <span className="shrink-0 rounded-lg border border-[var(--gray-3)] px-2.5 py-1 text-[11px] text-[var(--gray-6)]">
              Last 30 min
            </span>
          </div>

          <div className="divide-y divide-[var(--gray-3)]">
            {recentActivity.length === 0 ? (
              <EmptyState title="No recent activity" description="No notification activity found yet." />
            ) : null}
            {recentActivity.map((item) => (
              <div
                key={item.id}
                className="px-4 py-3 sm:px-5 sm:py-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate text-[13px] font-medium text-[var(--gray-9)]">{item.title}</p>
                      <span className="shrink-0 rounded border border-[var(--gray-3)] px-1.5 py-px text-[10px] uppercase tracking-[0.12em] text-[var(--gray-6)]">
                        {item.channel}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="truncate text-xs text-[var(--gray-6)]">{item.target}</p>
                      <span className="shrink-0 text-[11px] text-[var(--gray-5)] sm:hidden">{item.time}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={item.status} />
                    <span className="hidden text-xs text-[var(--gray-6)] sm:block">{item.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* Channel health */}
          <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)] p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-[var(--gray-10)]">Channel Health</h2>
            <p className="mt-0.5 text-xs text-[var(--gray-6)]">Success rate by delivery channel.</p>

            <div className="mt-4 space-y-4">
              {channelHealth.length === 0 && (
                <p className="py-4 text-center text-xs text-[var(--gray-5)]">No channel activity yet.</p>
              )}
              {channelHealth.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--gray-3)] text-[var(--gray-7)]">
                          <Icon className="h-3 w-3" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-[var(--gray-9)]">{item.label}</p>
                          <p className="text-[11px] text-[var(--gray-6)]">{item.volume}</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-[13px] font-semibold text-[var(--gray-10)]">{item.value}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-[var(--gray-3)]">
                      <div
                        className="h-1 rounded-full bg-[linear-gradient(90deg,#f59e0b,#fbbf24)]"
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Queue snapshot */}
          <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)] p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-[var(--gray-10)]">Queue Snapshot</h2>
            <p className="mt-0.5 text-xs text-[var(--gray-6)]">Current pipeline status.</p>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {queueSnapshot.map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-[var(--gray-3)] bg-[var(--gray-1)] px-3 py-3"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-6)]">
                    {item.label}
                  </p>
                  <p className={`mt-2 text-xl font-semibold tabular-nums ${item.color}`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
