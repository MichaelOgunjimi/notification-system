"use client";

import { useQuery } from "@tanstack/react-query";
import { listAdminKeys } from "@/lib/api";
import { StatCard } from "@/components/dashboard/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { formatRelativeTime } from "@/lib/utils";

export default function AdminKeysPage() {
  const { data: keys, isLoading, error } = useQuery({ queryKey: ["admin", "keys"], queryFn: listAdminKeys });

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

  const total = keys?.length ?? 0;
  const active = keys?.filter((k) => k.is_active).length ?? 0;
  const revoked = keys?.filter((k) => !k.is_active).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard label="Total Keys" value={total} />
        <StatCard label="Active Keys" value={active} />
        <StatCard label="Revoked Keys" value={revoked} />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="divide-y divide-[var(--gray-3)]">
          {keys?.length === 0 ? <EmptyState title="No keys found" description="No admin keys available." /> : null}
          {keys?.map((key) => (
            <div key={key.id} className="flex items-center justify-between px-4 py-3.5 sm:px-5">
              <div>
                <p className="text-[13px] font-medium text-[var(--gray-9)]">{key.name}</p>
                <p className="text-[12px] text-[var(--gray-6)]">{key.key_prefix} · {key.event_count} calls</p>
              </div>
              <div className="text-right">
                <p className="text-[12px] text-[var(--gray-6)]">{key.is_active ? "active" : "revoked"}</p>
                <p className="text-[12px] text-[var(--gray-6)]">{key.last_used_at ? formatRelativeTime(key.last_used_at) : "Never"}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
