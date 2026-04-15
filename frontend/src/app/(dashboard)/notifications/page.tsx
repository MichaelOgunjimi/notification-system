"use client";

import Link from "next/link";
import { Activity, ArrowUpRight, Bell, Clock, Filter, RotateCcw } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { TablePagination } from "@/components/shared/table-pagination";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/utils";
import { getAnalytics, listNotifications } from "@/lib/api";

const channelFilters = ["All", "Email", "SMS", "Webhook", "Failed"];
const channelColor = { email: "text-[#60a5fa]", sms: "text-[#4ade80]", webhook: "text-[#a78bfa]" };

export default function NotificationsPage() {
  const [page] = useState(1);
  const [activeFilter, setActiveFilter] = useState("All");
  const router = useRouter();
  const channelParam = ["Email", "SMS", "Webhook"].includes(activeFilter)
    ? activeFilter.toLowerCase()
    : undefined;
  const statusParam = activeFilter === "Failed" ? "failed" : undefined;

  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications", { page, channel: channelParam, status: statusParam }],
    queryFn: () =>
      listNotifications({
        page,
        per_page: 20,
        channel: channelParam,
        status: statusParam,
      }),
  });
  const { data: analytics } = useQuery({
    queryKey: ["analytics"],
    queryFn: getAnalytics,
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
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Delivered" value={(analytics?.notifications_delivered ?? 0).toLocaleString()} icon={<Bell className="h-3.5 w-3.5 text-[#4ade80]" />} />
        <StatCard label="Retry Queue" value={String((analytics?.notifications_queued ?? 0) + (analytics?.notifications_processing ?? 0))} icon={<RotateCcw className="h-3.5 w-3.5 text-[#fbbf24]" />} />
        <StatCard label="Median Latency" value={analytics?.avg_delivery_latency_ms ? `${analytics.avg_delivery_latency_ms}ms` : "N/A"} icon={<Clock className="h-3.5 w-3.5 text-[var(--gray-6)]" />} />
        <StatCard label="Fail Rate" value={`${(100 - (analytics?.success_rate ?? 0)).toFixed(1)}%`} icon={<Activity className="h-3.5 w-3.5 text-[#f87171]" />} />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {channelFilters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setActiveFilter(f)}
              className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${activeFilter === f ? "border-[color:rgba(245,158,11,0.24)] bg-[color:rgba(245,158,11,0.1)] text-[var(--gray-10)]" : "border-[var(--gray-3)] bg-transparent text-[var(--gray-6)] hover:bg-[var(--gray-2)] hover:text-[var(--gray-9)]"}`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-[color:rgba(34,197,94,0.2)] bg-[color:rgba(34,197,94,0.07)] px-2.5 py-1 text-[11px] font-medium text-[var(--status-delivered)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-delivered)] animate-pulse" />
            Live polling
          </div>
          <button type="button" className="flex items-center gap-2 rounded-lg border border-[var(--gray-3)] bg-[var(--gray-2)] px-3 py-1.5 text-[13px] text-[var(--gray-6)] hover:bg-[var(--gray-3)] hover:text-[var(--gray-9)] transition-colors">
            <Filter className="h-3.5 w-3.5" />
            Filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="flex items-center justify-between border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-[var(--gray-10)]">Notification Stream</h2>
            <p className="mt-0.5 text-xs text-[var(--gray-6)]">Latest delivery attempts and state changes.</p>
          </div>
          <span className="shrink-0 rounded-lg border border-[var(--gray-3)] px-2.5 py-1 text-[11px] text-[var(--gray-9)]">Last 30 min</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-[var(--gray-3)]">
                {["Notification", "Channel", "Recipient", "Status", "Retries", "Time", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--gray-5)] sm:px-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--gray-3)]">
              {data?.items.map((row) => (
                <tr
                  key={row.id}
                  className="group cursor-pointer transition-colors hover:bg-[var(--gray-1)]"
                  onClick={() => router.push(`/notifications/${row.id}`)}
                >
                  <td className="px-4 py-3.5 sm:px-5">
                    <p className="text-[13px] font-medium text-[var(--gray-9)]">{row.event_id || row.channel}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-[var(--gray-8)]">{row.id.slice(0, 24)}…</p>
                  </td>
                  <td className="px-4 py-3.5 sm:px-5">
                    <span className={`text-xs font-medium ${channelColor[row.channel] ?? ""}`}>{row.channel}</span>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-[var(--gray-9)] sm:px-5">{row.recipient_address}</td>
                  <td className="px-4 py-3.5 sm:px-5"><StatusBadge status={row.status} /></td>
                  <td className="px-4 py-3.5 sm:px-5">
                    <span className={`text-[13px] tabular-nums ${row.retry_count > 0 ? "text-[#fdba74]" : "text-[var(--gray-9)]"}`}>{row.retry_count}</span>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-[var(--gray-9)] sm:px-5">{formatRelativeTime(row.created_at)}</td>
                  <td className="px-4 py-3.5 text-right sm:px-5">
                    <Link
                      href={`/notifications/${row.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-md border border-[color:rgba(245,158,11,0.2)] bg-[color:rgba(245,158,11,0.06)] px-2.5 py-1 text-[12px] font-medium text-[var(--primary)] transition-colors hover:border-[color:rgba(245,158,11,0.4)] hover:bg-[color:rgba(245,158,11,0.14)] hover:text-[#fbbf24]"
                    >
                      View <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.items.length === 0 ? (
          <EmptyState title="No notifications found" description="No notifications match the selected filter." />
        ) : null}
        <TablePagination page={page} totalPages={data?.total_pages ?? 1} total={data?.total ?? 0} perPage={20} />
      </div>
    </div>
  );
}
