"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAuditLog } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/utils";
import { TablePagination } from "@/components/shared/table-pagination";

const actions = ["All", "Create", "Update", "Delete"];

export default function AuditLogPage() {
  const [page] = useState(1);
  const [activeAction, setActiveAction] = useState("All");
  const actionParam = activeAction !== "All" ? activeAction.toLowerCase() : undefined;
  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-log", { page, action: actionParam }],
    queryFn: () => listAuditLog({ page, per_page: 20, action: actionParam }),
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

  const rows = data?.items ?? [];
  const createCount = rows.filter((r) => r.action.toLowerCase().includes("create")).length;
  const updateCount = rows.filter((r) => r.action.toLowerCase().includes("update")).length;
  const deleteCount = rows.filter((r) => r.action.toLowerCase().includes("delete")).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Total" value={data?.total ?? 0} />
        <StatCard label="Creates" value={createCount} />
        <StatCard label="Updates" value={updateCount} />
        <StatCard label="Deletes" value={deleteCount} />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="flex items-center justify-between border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-center gap-1.5">
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => setActiveAction(action)}
                className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${activeAction === action ? "border-[color:rgba(245,158,11,0.24)] bg-[color:rgba(245,158,11,0.1)] text-[var(--gray-10)]" : "border-[var(--gray-3)] bg-transparent text-[var(--gray-6)] hover:bg-[var(--gray-2)] hover:text-[var(--gray-9)]"}`}
              >
                {action}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-[var(--gray-3)]">
          {rows.length === 0 ? <EmptyState title="No audit log entries" description="No matching audit entries found." /> : null}
          {rows.map((log) => (
            <div key={log.id} className="grid grid-cols-5 gap-3 px-4 py-3 sm:px-5">
              <span className="text-[12px] text-[var(--gray-6)]">{formatDate(log.created_at).split(", ")[1]}</span>
              <span className="font-mono text-[12px] text-[var(--gray-7)]">{log.actor_ip ?? "system"}</span>
              <span className="text-[12px] text-[var(--gray-7)]">{log.action}</span>
              <span className="text-[12px] text-[var(--gray-7)]">{log.resource_type}</span>
              <span className="truncate text-[12px] text-[var(--gray-6)]">{JSON.stringify(log.metadata ?? {})}</span>
            </div>
          ))}
        </div>
        <TablePagination page={page} totalPages={data?.total_pages ?? 1} total={data?.total ?? 0} perPage={20} />
      </div>
    </div>
  );
}
