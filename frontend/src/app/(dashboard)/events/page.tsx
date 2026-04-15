"use client";

import Link from "next/link";
import { ArrowUpRight, Filter, Search } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { TablePagination } from "@/components/shared/table-pagination";
import { Activity, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/utils";
import { getAnalytics, listEvents } from "@/lib/api";

const priorityColor = {
  high: "text-[#f87171]",
  medium: "text-[#fbbf24]",
  low: "text-[#60a5fa]",
};

const filters = ["All Events", "Completed", "Failed", "Processing"];

export default function EventsPage() {
  const [page] = useState(1);
  const [status, setStatus] = useState("");
  const router = useRouter();
  const { data, isLoading, error } = useQuery({
    queryKey: ["events", { page, status }],
    queryFn: () => listEvents({ page, per_page: 20, status: status || undefined }),
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
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Total Today" value={(analytics?.events_today ?? 0).toLocaleString()} icon={<Zap className="h-3.5 w-3.5 text-[#60a5fa]" />} />
        <StatCard label="Completed" value={(analytics?.events_completed ?? 0).toLocaleString()} icon={<CheckCircle2 className="h-3.5 w-3.5 text-[#4ade80]" />} />
        <StatCard label="Failed" value={(analytics?.events_failed ?? 0).toLocaleString()} icon={<AlertTriangle className="h-3.5 w-3.5 text-[#f87171]" />} />
        <StatCard label="Processing" value={(analytics?.events_processing ?? 0).toLocaleString()} icon={<Activity className="h-3.5 w-3.5 text-[#fbbf24]" />} />
      </div>

      {/* Filters + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() =>
                setStatus(
                  f === "All Events"
                    ? ""
                    : f === "Completed"
                      ? "completed"
                      : f === "Failed"
                        ? "failed"
                        : "processing",
                )
              }
              className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                (f === "All Events" && status === "") ||
                (f === "Completed" && status === "completed") ||
                (f === "Failed" && status === "failed") ||
                (f === "Processing" && status === "processing")
                  ? "border-[color:rgba(245,158,11,0.24)] bg-[color:rgba(245,158,11,0.1)] text-[var(--gray-10)]"
                  : "border-[var(--gray-3)] bg-transparent text-[var(--gray-6)] hover:bg-[var(--gray-2)] hover:text-[var(--gray-9)]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="flex items-center gap-2 rounded-lg border border-[var(--gray-3)] bg-[var(--gray-2)] px-3 py-1.5 text-[13px] text-[var(--gray-6)] hover:bg-[var(--gray-3)] hover:text-[var(--gray-9)] transition-colors">
            <Search className="h-3.5 w-3.5" />
            Search events
          </button>
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
            <h2 className="text-sm font-semibold text-[var(--gray-10)]">Recent Events</h2>
            <p className="mt-0.5 text-xs text-[var(--gray-6)]">Event ingestion log across all channels.</p>
          </div>
          <span className="shrink-0 rounded-lg border border-[var(--gray-3)] px-2.5 py-1 text-[11px] text-[var(--gray-9)]">
            {data?.total ?? 0}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-[var(--gray-3)]">
                {["Event", "Recipients", "Priority", "Status", "Created", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--gray-5)] sm:px-5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--gray-3)]">
              {data?.items.map((row) => (
                <tr
                  key={row.id}
                  className="group cursor-pointer transition-colors hover:bg-[var(--gray-1)]"
                  onClick={() => router.push(`/events/${row.id}`)}
                >
                  <td className="px-4 py-3.5 sm:px-5">
                    <p className="truncate text-[13px] font-medium text-[var(--gray-9)] max-w-[220px]">{row.event_type}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-[var(--gray-8)]">{row.id.slice(0, 24)}…</p>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-[var(--gray-9)] sm:px-5">{row.recipient_count}</td>
                  <td className="px-4 py-3.5 sm:px-5">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${priorityColor[row.priority as keyof typeof priorityColor] ?? "text-[var(--gray-6)]"}`}>
                      {row.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 sm:px-5">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-[var(--gray-9)] sm:px-5">{formatRelativeTime(row.created_at)}</td>
                  <td className="px-4 py-3.5 text-right sm:px-5">
                    <Link
                      href={`/events/${row.id}`}
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
          <EmptyState title="No events found" description="No events match the current filter." />
        ) : null}
        <TablePagination
          page={page}
          totalPages={data?.total_pages ?? 1}
          total={data?.total ?? 0}
          perPage={20}
        />
      </div>
    </div>
  );
}
