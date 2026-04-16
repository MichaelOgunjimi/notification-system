"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, ShieldAlert, Inbox } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TablePagination } from "@/components/shared/table-pagination";
import { formatRelativeTime } from "@/lib/utils";
import { discardDLQ, listDLQ, retryDLQ } from "@/lib/api";
import { toast } from "sonner";

const CHANNEL_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  email:   { bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.25)",  text: "#93c5fd" },
  sms:     { bg: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.25)",  text: "#86efac" },
  webhook: { bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.25)", text: "#c4b5fd" },
};

function ChannelTag({ channel }: { channel: string }) {
  const c = CHANNEL_COLORS[channel] ?? { bg: "rgba(156,163,175,0.08)", border: "rgba(156,163,175,0.2)", text: "#9ca3af" };
  return (
    <span
      style={{ background: c.bg, borderColor: c.border, color: c.text }}
      className="rounded border px-1.5 py-px text-[10px] uppercase tracking-[0.12em] font-medium"
    >
      {channel}
    </span>
  );
}


const STATUS_TABS = [
  { label: "All", value: undefined },
  { label: "Active", value: "active" as const },
  { label: "Retried", value: "retried" as const },
  { label: "Discarded", value: "discarded" as const },
];

const PER_PAGE = 20;

export default function DLQPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"active" | "retried" | "discarded" | undefined>(undefined);

  const { data, isLoading, error } = useQuery({
    queryKey: ["dead-letter", { page, status: statusFilter }],
    queryFn: () => listDLQ({ page, per_page: PER_PAGE, status: statusFilter }),
  });

  const retryMutation = useMutation({
    mutationFn: retryDLQ,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dead-letter"] });
      toast.success("DLQ entry retried");
    },
    onError: () => toast.error("Failed to retry DLQ entry"),
  });
  const discardMutation = useMutation({
    mutationFn: discardDLQ,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dead-letter"] });
      toast.success("DLQ entry discarded");
    },
    onError: () => toast.error("Failed to discard DLQ entry"),
  });

  function handleTabChange(value: "active" | "retried" | "discarded" | undefined) {
    setStatusFilter(value);
    setPage(1);
  }

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

  const items = data?.items ?? [];
  const activeItems = items.filter(i => i.status === "active");

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard label="Awaiting Review" value={data?.total ?? 0} icon={<ShieldAlert className="h-3.5 w-3.5 text-[#f87171]" />} />
        <StatCard label="Total on Page" value={items.length} icon={<Inbox className="h-3.5 w-3.5 text-[#fbbf24]" />} />
        <StatCard label="Active (Actionable)" value={activeItems.length} icon={<RotateCcw className="h-3.5 w-3.5 text-[#4ade80]" />} />
      </div>

      {/* Failed deliveries */}
      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="flex items-center justify-between border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-[var(--gray-10)]">Failed Deliveries</h2>
            <p className="mt-0.5 text-xs text-[var(--gray-6)]">Notifications that exhausted all retry attempts.</p>
          </div>
          <button
            type="button"
            onClick={() => activeItems.forEach(i => retryMutation.mutate(i.id))}
            disabled={activeItems.length === 0 || retryMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--gray-3)] bg-[var(--gray-2)] px-3 py-1.5 text-[13px] text-[var(--gray-7)] hover:bg-[var(--gray-3)] hover:text-[var(--gray-9)] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry All Active
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-0.5 border-b border-[var(--gray-3)] px-4 sm:px-5">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.label}
              type="button"
              onClick={() => handleTabChange(tab.value)}
              className={`-mb-px px-3 py-2.5 text-[12px] font-medium transition-colors border-b-2 ${
                statusFilter === tab.value
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--gray-6)] hover:text-[var(--gray-9)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="divide-y divide-[var(--gray-3)]">
          {items.length === 0 ? (
            <EmptyState title="No dead letters" description="No notifications in the dead letter queue." />
          ) : null}
          {items.map((item) => (
            <div key={item.id} className="px-4 py-4 sm:px-5 hover:bg-[var(--gray-3)] transition-colors">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <Link
                  href={`/notifications/${item.notification_id}`}
                  className="min-w-0 flex-1 cursor-pointer"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#fca5a5]" />
                    <p className="text-[13px] font-medium text-[var(--gray-9)]">{item.notification_id}</p>
                    <ChannelTag channel={item.channel} />
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-1.5 text-[12px] text-[var(--gray-6)]">
                    <span className="text-[var(--gray-7)]">{item.recipient_address}</span>
                    <span className="mx-2 text-[var(--gray-4)]">·</span>
                    {item.error_message ?? "Unknown error"}
                    <span className="mx-2 text-[var(--gray-4)]">·</span>
                    {item.retry_count} attempts
                    <span className="mx-2 text-[var(--gray-4)]">·</span>
                    {formatRelativeTime(item.created_at)}
                  </p>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => retryMutation.mutate(item.id)}
                    disabled={item.status !== "active" || retryMutation.isPending}
                    className="rounded-lg border border-[var(--gray-3)] bg-[var(--gray-2)] px-3 py-1.5 text-[13px] text-[var(--gray-7)] hover:bg-[var(--gray-3)] hover:text-[var(--gray-9)] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => discardMutation.mutate(item.id)}
                    disabled={item.status !== "active" || discardMutation.isPending}
                    className="rounded-lg border border-[color:rgba(239,68,68,0.2)] bg-[color:rgba(239,68,68,0.08)] px-3 py-1.5 text-[13px] text-[#fca5a5] hover:bg-[color:rgba(239,68,68,0.14)] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <TablePagination
            page={page}
            totalPages={data?.total_pages ?? 1}
            total={data?.total ?? 0}
            perPage={PER_PAGE}
            onPageChange={setPage}
          />
      </div>
    </div>
  );
}
