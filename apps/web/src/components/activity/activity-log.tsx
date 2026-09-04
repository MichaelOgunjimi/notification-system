"use client";

import { useMemo } from "react";
import type { AuditLogEntry, Organization, Project } from "@beaco/control-plane";
import { useOrganizationAuditLog, useProjectAuditLog } from "@beaco/control-plane/react";
import { LogEntryDetail, LogTable, type LogColumn } from "@/components/ui/log-table";
import { LogFilters } from "@/components/ui/log-filters";
import { LogPill } from "@/components/ui/log-pill";
import { TablePager } from "@/components/ui/table-pager";
import {
  LOG_PER_PAGE_OPTIONS,
  dateWindowFor,
  useLogUrlState,
} from "@/components/ui/use-log-url-state";
import {
  actionTone,
  detailsSummary,
  humanizeAction,
  relativeTime,
  statusForAction,
} from "@/lib/audit-log";
import "./activity-log.css";

/** Props for {@link ActivityLog}. */
type ActivityLogProps = Readonly<{
  /** Active organization. */
  organization: Organization;
  /** Active project (the fallback scope without `organization:audit:read`). */
  project: Project;
  /** Sibling projects offered by the project filter. */
  projects: readonly Project[];
}>;

const KIND_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "event.", label: "Events" },
  { value: "template.", label: "Templates" },
  { value: "notification.", label: "Deliveries" },
];

/**
 * Reads a metadata field as a display string.
 *
 * @param entry Audit log entry.
 * @param key Metadata key to read.
 * @returns The value as a string, or `null` when absent or empty.
 */
function metaString(entry: AuditLogEntry, key: string): string | null {
  const value = entry.metadata[key];
  return value === undefined || value === null || value === "" ? null : String(value);
}

/**
 * Operational activity — everything the project's API keys have done: events
 * ingested, templates changed, deliveries triggered. Same shell as the audit
 * log, pinned to `category: "operational"` with operational columns.
 *
 * @param props Active organization, project, and the sibling project list.
 * @returns The activity surface.
 */
export function ActivityLog({ organization, project, projects }: ActivityLogProps) {
  const { state, patch } = useLogUrlState();
  const canReadOrganization = useMemo(
    () => new Set(organization.capabilities).has("organization:audit:read"),
    [organization.capabilities],
  );

  const dateWindow = useMemo(
    () => dateWindowFor(state.range, state.from, state.to),
    [state.range, state.from, state.to],
  );

  const filter = {
    page: state.page,
    perPage: state.perPage,
    category: "operational" as const,
    action: state.action || undefined,
    from: dateWindow.from,
    to: dateWindow.to,
  };

  const scopeProjectId = canReadOrganization ? state.project : project.id;
  const orgQuery = useOrganizationAuditLog(
    canReadOrganization && !scopeProjectId ? organization.id : null,
    filter,
  );
  const projectQuery = useProjectAuditLog(scopeProjectId || null, filter);
  const query = scopeProjectId ? projectQuery : orgQuery;

  const entries = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = query.data ? Math.max(1, query.data.totalPages) : 1;

  const columns: ReadonlyArray<LogColumn<AuditLogEntry>> = [
    {
      key: "time",
      label: "Time",
      width: "108px",
      render: (entry) => (
        <time
          className="activity-log__time"
          dateTime={entry.createdAt}
          title={new Date(entry.createdAt).toLocaleString()}
        >
          {relativeTime(entry.createdAt)}
        </time>
      ),
    },
    {
      key: "action",
      label: "Action",
      width: "minmax(140px, 170px)",
      render: (entry) => (
        <span title={entry.action}>
          <LogPill label={humanizeAction(entry.action)} tone={actionTone(entry.action)} />
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: "120px",
      render: (entry) => {
        const status = statusForAction(entry.action);
        return status ? (
          <LogPill label={status.label} tone={status.tone} />
        ) : (
          <span className="activity-log__muted">—</span>
        );
      },
    },
    {
      key: "type",
      label: "Type",
      width: "minmax(160px, 240px)",
      render: (entry) => (
        <span className="activity-log__type">
          {metaString(entry, "event_type") ?? metaString(entry, "name") ?? "—"}
        </span>
      ),
    },
    {
      key: "priority",
      label: "Priority",
      width: "96px",
      render: (entry) => {
        const priority = metaString(entry, "priority");
        return priority ? (
          <span className="activity-log__priority" data-priority={priority}>
            {priority}
          </span>
        ) : (
          <span className="activity-log__muted">—</span>
        );
      },
    },
    {
      key: "details",
      label: "Details",
      width: "minmax(200px, 1fr)",
      render: (entry) => <span className="activity-log__details">{detailsSummary(entry)}</span>,
    },
  ];

  const filtersActive = state.action !== "" || state.range !== "all" || state.project !== "";

  return (
    <div className="activity-log">
      <header className="activity-log__heading">
        <div>
          <p>Operations</p>
          <h1>Activity</h1>
          <span>
            Everything your API keys have done — events ingested, templates changed, deliveries
            triggered.
          </span>
        </div>
        <span className="activity-log__tag" title="Refreshes automatically">
          <span className="activity-log__live" aria-hidden />
          {query.data ? `${query.data.total.toLocaleString()} entries` : "Counting…"}
        </span>
      </header>

      <LogFilters
        value={state}
        onChange={patch}
        projects={canReadOrganization ? projects : [project]}
        hideSearch
      >
        <div className="activity-log__kinds" role="group" aria-label="Kind">
          {KIND_FILTERS.map((option) => (
            <button
              key={option.value || "all"}
              type="button"
              data-active={state.action === option.value || undefined}
              onClick={() => patch({ action: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </LogFilters>

      <LogTable
        columns={columns}
        rows={entries}
        rowKey={(entry) => entry.id}
        renderExpanded={(entry) => <LogEntryDetail entry={entry} />}
        pending={query.isPending}
        busy={query.isFetching}
        error={query.isError ? query.error.message : null}
        emptyLabel={
          filtersActive ? "No activity matches these filters." : "No activity recorded yet."
        }
        footer={
          <TablePager
            page={state.page}
            totalPages={totalPages}
            total={total}
            perPage={state.perPage}
            perPageOptions={LOG_PER_PAGE_OPTIONS}
            busy={query.isFetching}
            onPageChange={(page) => patch({ page })}
            onPerPageChange={(perPage) => patch({ perPage, page: 1 })}
          />
        }
      />
    </div>
  );
}
