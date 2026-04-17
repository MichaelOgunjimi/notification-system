"use client";

import Link from "next/link";
import { Activity, ArrowUpRight, Bell, Clock, RotateCcw } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { TablePagination } from "@/components/shared/table-pagination";
import { DateRangeFilter, presetToDateRange } from "@/components/shared/date-range-filter";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { EmptyState } from "@/components/shared/empty-state";
import { FadeIn } from "@/components/shared/motion";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime, cn } from "@/lib/utils";
import { listNotifications } from "@/lib/api";
import { useDateFilter } from "@/hooks/use-date-filter";

const channelFilters = ["All", "Email", "SMS", "Webhook", "Failed"];
const channelColor = { email: "text-[#60a5fa]", sms: "text-[#4ade80]", webhook: "text-[#a78bfa]" };

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState("All");
  const { preset, setPreset, customRange, setCustomRange } = useDateFilter("today");
  const router = useRouter();

  const dateRange = presetToDateRange(preset, customRange);
  const channelParam = ["Email", "SMS", "Webhook"].includes(activeFilter)
    ? activeFilter.toLowerCase()
    : undefined;
  const statusParam = activeFilter === "Failed" ? "failed" : undefined;

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["notifications", { page, channel: channelParam, status: statusParam, preset, customRange }],
    queryFn: () =>
      listNotifications({
        page,
        per_page: 20,
        channel: channelParam,
        status: statusParam,
        date_from: dateRange.from,
        date_to: dateRange.to,
      }),
    placeholderData: keepPreviousData,
  });

  // All-time counts from lightweight list queries
  const { data: totalDelivered } = useQuery({ queryKey: ["notif-count", "delivered"], queryFn: () => listNotifications({ per_page: 1, status: "delivered" }) });
  const { data: totalQueued } = useQuery({ queryKey: ["notif-count", "queued"], queryFn: () => listNotifications({ per_page: 1, status: "queued" }) });
  const { data: totalProcessing } = useQuery({ queryKey: ["notif-count", "processing"], queryFn: () => listNotifications({ per_page: 1, status: "processing" }) });
  const { data: totalFailed } = useQuery({ queryKey: ["notif-count", "failed"], queryFn: () => listNotifications({ per_page: 1, status: "failed" }) });

  function setFilter(f: string) {
    setActiveFilter(f);
    setPage(1);
  }

  if (!data && isLoading) {
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
    <FadeIn>
      <div className={cn("space-y-5", "transition-opacity duration-150", isFetching && !isLoading && "opacity-60 pointer-events-none")}>
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="Delivered" value={(totalDelivered?.total ?? 0).toLocaleString()} icon={<Bell className="h-3.5 w-3.5 text-[#4ade80]" />} />
          <StatCard label="In Queue" value={String((totalQueued?.total ?? 0) + (totalProcessing?.total ?? 0))} icon={<RotateCcw className="h-3.5 w-3.5 text-[#fbbf24]" />} />
          <StatCard label="Failed" value={(totalFailed?.total ?? 0).toLocaleString()} icon={<Activity className="h-3.5 w-3.5 text-[#f87171]" />} />
          <StatCard
            label="Fail Rate"
            value={(() => {
              const d = totalDelivered?.total ?? 0;
              const f = totalFailed?.total ?? 0;
              return d + f > 0 ? `${((f / (d + f)) * 100).toFixed(1)}%` : "N/A";
            })()}
            icon={<Clock className="h-3.5 w-3.5 text-[var(--gray-6)]" />}
          />
        </div>

        {/* Filters */}
        <div className="space-y-3">
        {/* Channel + status tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            {channelFilters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${activeFilter === f ? "border-[color:rgba(245,158,11,0.24)] bg-[color:rgba(245,158,11,0.1)] text-[var(--gray-10)]" : "border-[var(--gray-3)] bg-transparent text-[var(--gray-6)] hover:bg-[var(--gray-2)] hover:text-[var(--gray-9)]"}`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-[color:rgba(34,197,94,0.2)] bg-[color:rgba(34,197,94,0.07)] px-2.5 py-1 text-[11px] font-medium text-[var(--status-delivered)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-delivered)] animate-pulse" />
            Live polling
          </div>
        </div>

        {/* Date range */}
        <DateRangeFilter
          preset={preset}
          customRange={customRange}
          onPreset={(p) => { setPreset(p); setPage(1); }}
          onCustomRange={(r) => { setCustomRange(r); setPage(1); }}
        />
      </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="flex items-center justify-between border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-[var(--gray-10)]">Notification Stream</h2>
            <p className="mt-0.5 text-xs text-[var(--gray-6)]">Latest delivery attempts and state changes.</p>
          </div>
          <span className="shrink-0 rounded-lg border border-[var(--gray-3)] px-2.5 py-1 text-[11px] text-[var(--gray-9)]">{data?.total ?? 0}</span>
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
                    <span className={`text-xs font-medium ${channelColor[row.channel as keyof typeof channelColor] ?? ""}`}>{row.channel}</span>
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
                      onClick={(e) => e.stopPropagation()}
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
        <TablePagination page={page} totalPages={data?.total_pages ?? 1} total={data?.total ?? 0} perPage={20} onPageChange={setPage} />
        </div>
      </div>
    </FadeIn>
  );
}
