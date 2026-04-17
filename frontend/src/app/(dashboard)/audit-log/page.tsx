"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { DateRangeFilter, presetToDateRange } from "@/components/shared/date-range-filter";
import { listAuditLog } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { AnimatePresence, FadeIn, motion } from "@/components/shared/motion";
import { cn, formatDate } from "@/lib/utils";
import { TablePagination } from "@/components/shared/table-pagination";
import type { AuditLogResponse } from "@/types/api";
import { useDateFilter } from "@/hooks/use-date-filter";

const ACTION_FILTERS = ["All", "Created", "Updated", "Delivered", "Failed", "Sent", "Rotated"] as const;

function getActionBadgeClasses(action: string) {
  const normalized = action.toLowerCase();

  if (["delivered", "completed"].includes(normalized)) {
    return "border-[color:rgba(34,197,94,0.24)] bg-[color:rgba(34,197,94,0.1)] text-[#4ade80]";
  }
  if (normalized === "failed") {
    return "border-[color:rgba(248,113,113,0.24)] bg-[color:rgba(248,113,113,0.1)] text-[#f87171]";
  }
  if (["sent", "retried"].includes(normalized)) {
    return "border-[color:rgba(251,191,36,0.24)] bg-[color:rgba(251,191,36,0.1)] text-[#fbbf24]";
  }
  if (normalized === "created") {
    return "border-[color:rgba(96,165,250,0.24)] bg-[color:rgba(96,165,250,0.1)] text-[#60a5fa]";
  }

  return "border-[var(--gray-3)] bg-[var(--gray-1)] text-[var(--gray-7)]";
}

function formatMetadataSummary(metadata: AuditLogResponse["metadata"]) {
  if (!metadata) return "";

  const pairs = Object.entries(metadata).filter(([key, value]) => {
    if (value === null || value === undefined || value === "") return false;
    if (key === "seed" || key === "index") return false;
    return true;
  });

  if (pairs.length === 0) return "";

  return pairs
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" • ");
}

function formatDetails(log: AuditLogResponse) {
  const resourceType = log.resource_type || "resource";
  const resourceRef = log.resource_id ? `${resourceType} #${log.resource_id}` : resourceType;
  const metadataSummary = formatMetadataSummary(log.metadata);
  return metadataSummary ? `${resourceRef} • ${metadataSummary}` : resourceRef;
}

function MetadataPanel({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return <p className="text-[12px] text-[var(--gray-5)] italic">No metadata recorded.</p>;
  }

  const entries = Object.entries(metadata).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-lg border border-[var(--gray-3)] bg-[var(--gray-1)] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--gray-5)]">{key.replace(/_/g, " ")}</p>
          <p className="mt-0.5 break-all font-mono text-[12px] text-[var(--gray-9)]">
            {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const { preset, setPreset, customRange, setCustomRange } = useDateFilter("30d");
  const [activeAction, setActiveAction] = useState("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const dateRange = presetToDateRange(preset, customRange);
  const actionParam = activeAction !== "All" ? activeAction.toLowerCase() : undefined;

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["audit-log", { page, action: actionParam, preset, customRange, from: dateRange.from }],
    queryFn: () => listAuditLog({ page, per_page: 20, action: actionParam, from: dateRange.from }),
    placeholderData: keepPreviousData,
  });

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

  const rows = data?.items ?? [];

  return (
    <FadeIn>
      <div className={cn("space-y-5", "transition-opacity duration-150", isFetching && !isLoading && "opacity-60 pointer-events-none")}>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="Filtered Entries" value={data?.total ?? 0} />
          <StatCard label="This Page" value={rows.length} />
          <StatCard label="Pages" value={data?.total_pages ?? 1} />
          <StatCard label="Action Filter" value={activeAction} />
        </div>

        <DateRangeFilter
          preset={preset}
          customRange={customRange}
          onPreset={(nextPreset) => {
            setPreset(nextPreset);
            setPage(1);
          }}
          onCustomRange={(nextRange) => {
            setCustomRange(nextRange);
            setPage(1);
          }}
        />

        <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-center gap-1.5">
            {ACTION_FILTERS.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => {
                    setActiveAction(action);
                    setPage(1);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${activeAction === action ? "border-[color:rgba(245,158,11,0.24)] bg-[color:rgba(245,158,11,0.1)] text-[var(--gray-10)]" : "border-[var(--gray-3)] bg-transparent text-[var(--gray-6)] hover:bg-[var(--gray-2)] hover:text-[var(--gray-9)]"}`}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-[16px_1fr_1fr_auto_1fr_1fr] gap-3 bg-[var(--gray-1)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--gray-5)] sm:px-5">
            <span />
            <span>Time</span>
            <span>IP Address</span>
            <span>Action</span>
            <span>Resource</span>
            <span>Details</span>
          </div>

        <div className="divide-y divide-[var(--gray-3)]">
          {rows.length === 0 ? <EmptyState title="No audit log entries" description="No matching audit entries found." /> : null}
          {rows.map((log) => {
            const isExpanded = expandedId === log.id;
            return (
              <div key={log.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="grid w-full cursor-pointer grid-cols-[16px_1fr_1fr_auto_1fr_1fr] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--gray-1)] sm:px-5"
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 text-[var(--gray-5)] transition-transform duration-200",
                      isExpanded && "rotate-180",
                    )}
                  />
                  <span className="text-[12px] text-[var(--gray-6)]">{formatDate(log.created_at).replace(/,\s*\d{4}/, "")}</span>
                  <span className="font-mono text-[12px] text-[var(--gray-7)]">{log.ip_address ?? "system"}</span>
                  <span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${getActionBadgeClasses(log.action)}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {log.action}
                    </span>
                  </span>
                  <span className="text-[12px] text-[var(--gray-7)]">{log.resource_type}</span>
                  <span className="truncate text-[12px] text-[var(--gray-6)]">{formatDetails(log)}</span>
                </button>
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      key="detail"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-[var(--gray-3)] bg-[var(--gray-1)] px-5 py-4 sm:px-6">
                        <div className="mb-3 flex flex-wrap gap-4 text-[12px]">
                          <div>
                            <span className="text-[var(--gray-5)]">Full timestamp: </span>
                            <span className="font-mono text-[var(--gray-9)]">{formatDate(log.created_at)}</span>
                          </div>
                          {log.resource_id && (
                            <div>
                              <span className="text-[var(--gray-5)]">Resource ID: </span>
                              <span className="font-mono text-[var(--gray-9)]">{log.resource_id}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-[var(--gray-5)]">IP: </span>
                            <span className="font-mono text-[var(--gray-9)]">{log.ip_address ?? "N/A"}</span>
                          </div>
                        </div>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--gray-5)]">Metadata</p>
                        <MetadataPanel metadata={log.metadata} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
        <TablePagination page={page} totalPages={data?.total_pages ?? 1} total={data?.total ?? 0} perPage={20} onPageChange={setPage} />
        </div>
      </div>
    </FadeIn>
  );
}
