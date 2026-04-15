"use client";

import { AlertTriangle, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/utils";
import { discardDLQ, listDLQ, retryDLQ } from "@/lib/api";
import { toast } from "sonner";

export default function DLQPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dead-letter"],
    queryFn: () => listDLQ({ per_page: 50 }),
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

  const failed = data?.items ?? [];

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard label="Awaiting Review" value={data?.total ?? 0} icon={<ShieldAlert className="h-3.5 w-3.5" />} />
        <StatCard label="Total Failed" value={failed.length} icon={<RotateCcw className="h-3.5 w-3.5" />} />
        <StatCard label="Discarded Today" value="0" icon={<Trash2 className="h-3.5 w-3.5" />} />
      </div>

      {/* Failed deliveries */}
      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="flex items-center justify-between border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-[var(--gray-10)]">Failed Deliveries</h2>
            <p className="mt-0.5 text-xs text-[var(--gray-6)]">Notifications that exhausted all retry attempts.</p>
          </div>
          <button type="button" className="flex items-center gap-1.5 rounded-lg border border-[var(--gray-3)] bg-[var(--gray-2)] px-3 py-1.5 text-[13px] text-[var(--gray-7)] hover:bg-[var(--gray-3)] hover:text-[var(--gray-9)] transition-colors">
            <RotateCcw className="h-3.5 w-3.5" />
            Retry All
          </button>
        </div>

        <div className="divide-y divide-[var(--gray-3)]">
          {failed.length === 0 ? (
            <EmptyState title="No dead letters" description="No notifications in the dead letter queue." />
          ) : null}
          {failed.map((item) => (
            <div key={item.id} className="px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#fca5a5]" />
                    <p className="text-[13px] font-medium text-[var(--gray-9)]">{item.notification_id}</p>
                    <span className="rounded border border-[var(--gray-3)] px-1.5 py-px text-[10px] uppercase tracking-[0.12em] text-[var(--gray-6)]">{item.channel}</span>
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
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => retryMutation.mutate(item.id)}
                    className="rounded-lg border border-[var(--gray-3)] bg-[var(--gray-2)] px-3 py-1.5 text-[13px] text-[var(--gray-7)] hover:bg-[var(--gray-3)] hover:text-[var(--gray-9)] transition-colors"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => discardMutation.mutate(item.id)}
                    className="rounded-lg border border-[color:rgba(239,68,68,0.2)] bg-[color:rgba(239,68,68,0.08)] px-3 py-1.5 text-[13px] text-[#fca5a5] hover:bg-[color:rgba(239,68,68,0.14)] transition-colors"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
