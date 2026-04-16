"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Mail,
  Send,
  Webhook,
  XCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
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
  const failedNotificationsQuery = useQuery({
    queryKey: ["notifications", { status: "failed", per_page: 5 }],
    queryFn: () => listNotifications({ status: "failed", per_page: 5 }),
  });

  if (analyticsQuery.isLoading || notificationsQuery.isLoading || failedNotificationsQuery.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (analyticsQuery.error || notificationsQuery.error || failedNotificationsQuery.error) {
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

  // Notification status donut data
  const notifStatusData = [
    { name: "Delivered", value: analytics?.notifications_delivered ?? 0, color: "#4ade80" },
    { name: "Failed", value: analytics?.notifications_failed ?? 0, color: "#f87171" },
    { name: "Processing", value: analytics?.notifications_processing ?? 0, color: "#fbbf24" },
    { name: "Queued", value: analytics?.notifications_queued ?? 0, color: "#60a5fa" },
  ];
  const notifStatusTotal = notifStatusData.reduce((s, d) => s + d.value, 0);

  // Channel performance bar chart data
  const channelPerfData = (analytics?.channel_stats ?? []).map((ch) => ({
    channel: ch.channel.charAt(0).toUpperCase() + ch.channel.slice(1),
    delivered: ch.delivered,
    failed: ch.failed,
  }));

  // Recent failures
  const recentFailures = failedNotificationsQuery.data?.items ?? [];

  // Mobile summary bar chart data (notification pipeline at a glance)
  const mobileSummaryData = [
    { name: "Queued",     value: analytics?.notifications_queued ?? 0,     color: "#60a5fa" },
    { name: "Processing", value: analytics?.notifications_processing ?? 0, color: "#fbbf24" },
    { name: "Delivered",  value: analytics?.notifications_delivered ?? 0,  color: "#4ade80" },
    { name: "Failed",     value: analytics?.notifications_failed ?? 0,     color: "#f87171" },
  ];

  return (
    <div className="space-y-5">

      {/* ── Mobile stats chart (hidden sm+) ── */}
      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[#161616] p-4 sm:hidden">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6b7280]">Notification Pipeline</p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={mobileSummaryData} layout="vertical" margin={{ top: 0, right: 36, left: 70, bottom: 0 }}>
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#a3a3a3", fontSize: 12 }} width={70} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0];
                  return (
                    <div style={{ background: "#1c1c1c", border: "1px solid #2e2e2e", borderRadius: 8, padding: "6px 10px" }}>
                      <p style={{ color: "#e5e5e5", fontSize: 13, fontWeight: 600 }}>
                        <span style={{ color: (p.payload as { color: string }).color }}>● </span>
                        {(p.value as number).toLocaleString()}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {mobileSummaryData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#2e2e2e] pt-3">
          <div className="text-center">
            <p className="text-[10px] text-[#6b7280]">Events Today</p>
            <p className="text-[15px] font-semibold text-[#e5e5e5]">{(analytics?.events_today ?? 0).toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[#6b7280]">Delivery Rate</p>
            <p className="text-[15px] font-semibold text-[#e5e5e5]">
              {(analytics?.events_today ?? 0) === 0 ? "N/A" : `${(analytics?.success_rate ?? 100).toFixed(1)}%`}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[#6b7280]">Dead Letters</p>
            <p className="text-[15px] font-semibold text-[#f87171]">{analytics?.dlq_active ?? 0}</p>
          </div>
        </div>
      </div>

      {/* ── Stat cards (hidden on mobile) ── */}
      <div className="hidden sm:grid grid-cols-2 gap-3 xl:grid-cols-5">
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
        <StatCard
          label="Avg Latency"
          value={analytics?.avg_delivery_latency_ms != null && analytics.avg_delivery_latency_ms > 0
            ? `${analytics.avg_delivery_latency_ms.toFixed(0)}ms`
            : "N/A"}
          icon={<Clock className="h-3.5 w-3.5 text-[var(--gray-7)]" />}
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
              <Link
                key={item.id}
                href={`/notifications/${item.id}`}
                className="block px-4 py-3 transition-colors hover:bg-[var(--gray-3)] sm:px-5 sm:py-3.5"
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
              </Link>
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

            <div className="mt-4 space-y-0">
              {/* Queued */}
              <div className="flex items-center gap-3 rounded-lg border border-[var(--gray-3)] bg-[var(--gray-1)] px-3 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:rgba(96,165,250,0.12)]">
                  <span className="h-2 w-2 rounded-full bg-[#60a5fa]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-7)]">Queued</p>
                  <p className="text-[11px] text-[var(--gray-6)]">waiting</p>
                </div>
                <p className="text-lg font-semibold tabular-nums text-[#60a5fa]">{analytics?.notifications_queued ?? 0}</p>
              </div>
              {/* connector */}
              <div className="ml-[22px] h-4 w-px bg-[var(--gray-5)]" />
              {/* Processing */}
              <div className="flex items-center gap-3 rounded-lg border border-[var(--gray-3)] bg-[var(--gray-1)] px-3 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:rgba(251,191,36,0.12)]">
                  <span className="h-2 w-2 rounded-full bg-[#fbbf24]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-7)]">Processing</p>
                  <p className="text-[11px] text-[var(--gray-6)]">in-flight</p>
                </div>
                <p className="text-lg font-semibold tabular-nums text-[#fbbf24]">{analytics?.notifications_processing ?? 0}</p>
              </div>
              {/* connector */}
              <div className="ml-[22px] h-4 w-px bg-[var(--gray-5)]" />
              {/* Dead Letter */}
              <div className="flex items-center gap-3 rounded-lg border border-[var(--gray-3)] bg-[var(--gray-1)] px-3 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:rgba(248,113,113,0.12)]">
                  <span className="h-2 w-2 rounded-full bg-[#f87171]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-7)]">Dead Letter</p>
                  <p className="text-[11px] text-[var(--gray-6)]">failed permanently</p>
                </div>
                <p className="text-lg font-semibold tabular-nums text-[#f87171]">{analytics?.dlq_active ?? 0}</p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Second row: charts + recent failures ── */}
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr_320px]">

        {/* Notification Status donut */}
        <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)] p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">Notification Status</h2>
          <p className="mt-0.5 text-xs text-[var(--gray-6)]">Breakdown of all notifications today.</p>
          <div className="mt-4 flex items-center gap-6">
            {notifStatusTotal === 0 ? (
              <div className="relative flex h-[120px] w-[120px] shrink-0 items-center justify-center">
                <svg width="120" height="120">
                  <circle cx="60" cy="60" r="47" fill="none" stroke="var(--gray-3)" strokeWidth="18" />
                </svg>
                <span className="absolute text-[10px] text-[var(--gray-6)]">No data</span>
              </div>
            ) : (
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie
                    data={notifStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={38}
                    outerRadius={56}
                    paddingAngle={notifStatusData.filter(d => d.value > 0).length > 1 ? 3 : 0}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {notifStatusData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="space-y-2">
              {notifStatusData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
                  <span className="text-[12px] text-[var(--gray-8)]">{d.name}</span>
                  <span className="ml-auto pl-4 text-[12px] font-semibold tabular-nums text-[var(--gray-10)]">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Channel Performance bar chart */}
        <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)] p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">Channel Performance</h2>
          <p className="mt-0.5 text-xs text-[var(--gray-6)]">Delivered vs failed per channel.</p>
          <div className="mt-4">
            {channelPerfData.length === 0 ? (
              <p className="py-8 text-center text-xs text-[var(--gray-6)]">No channel data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={channelPerfData} barSize={14} barGap={4}>
                  <XAxis
                    dataKey="channel"
                    tick={{ fill: "var(--gray-7)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      background: "var(--gray-2)",
                      border: "1px solid var(--gray-3)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--gray-10)",
                    }}
                    cursor={{ fill: "var(--gray-3)" }}
                  />
                  <Bar dataKey="delivered" name="Delivered" fill="#4ade80" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="failed" name="Failed" fill="#f87171" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Failures */}
        <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
          <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
            <h2 className="text-sm font-semibold text-[var(--gray-10)]">Recent Failures</h2>
            <p className="mt-0.5 text-xs text-[var(--gray-6)]">Latest failed notifications.</p>
          </div>
          <div className="divide-y divide-[var(--gray-3)]">
            {recentFailures.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[var(--gray-6)]">No failures 🎉</p>
            ) : (
              recentFailures.map((n) => (
                <Link
                  key={n.id}
                  href={`/notifications/${n.id}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--gray-3)] sm:px-5"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:rgba(248,113,113,0.12)]">
                    <XCircle className="h-3 w-3 text-[#f87171]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-[var(--gray-9)]">{n.recipient_address}</p>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--gray-6)]">{n.channel} · {formatRelativeTime(n.updated_at)}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
