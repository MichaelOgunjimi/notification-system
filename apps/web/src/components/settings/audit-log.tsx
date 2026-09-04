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
  actorLabel,
  actorRoleLabel,
  detailsSummary,
  humanizeAction,
  relativeTime,
} from "@/lib/audit-log";
import "./audit-log.css";

/** Props for {@link AuditLog}. */
type AuditLogProps = Readonly<{
  /** Active organization. */
  organization: Organization;
  /** Active project (the fallback scope without `organization:audit:read`). */
  project: Project;
  /** Sibling projects offered by the project filter. */
  projects: readonly Project[];
}>;

const ACTOR_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Anyone" },
  { value: "user", label: "People" },
  { value: "api_key", label: "API keys" },
];

/**
 * Governance audit log — every change to the organization and its projects and
 * who made it. Org-wide by default with a project filter; falls back to
 * project-scoped when the caller lacks `organization:audit:read`.
 *
 * @param props Active organization, project, and the sibling project list.
 * @returns The audit log surface.
 */
export function AuditLog({ organization, project, projects }: AuditLogProps) {
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
    category: "governance" as const,
    action: state.action || undefined,
    actor: state.actor || undefined,
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
          className="audit-log__time"
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
      width: "minmax(170px, 280px)",
      render: (entry) => (
        <span title={entry.action}>
          <LogPill label={humanizeAction(entry.action)} tone={actionTone(entry.action)} />
        </span>
      ),
    },
    {
      key: "who",
      label: "Who",
      width: "minmax(150px, 220px)",
      render: (entry) => {
        const role = actorRoleLabel(entry);
        return (
          <span className="audit-log__who">
            {actorLabel(entry)}
            {role ? <span className="audit-log__role">{role}</span> : null}
          </span>
        );
      },
    },
    {
      key: "details",
      label: "Details",
      width: "minmax(200px, 1fr)",
      render: (entry) => <span className="audit-log__details">{detailsSummary(entry)}</span>,
    },
  ];

  const filtersActive =
    state.actor !== "" || state.action !== "" || state.range !== "all" || state.project !== "";

  return (
    <div className="audit-log">
      <header className="audit-log__heading">
        <div>
          <p>Accountability</p>
          <h1>Audit log</h1>
          <span>
            Every change to your organization and projects, and who made it. Entries are immutable.
          </span>
        </div>
        <span className="audit-log__tag" title="Refreshes automatically">
          <span className="audit-log__live" aria-hidden />
          {query.data ? `${query.data.total.toLocaleString()} entries` : "Counting…"}
        </span>
      </header>

      <LogFilters
        value={state}
        onChange={patch}
        projects={canReadOrganization ? projects : [project]}
      >
        <div className="audit-log__actor" role="group" aria-label="Actor">
          {ACTOR_FILTERS.map((option) => (
            <button
              key={option.value || "any"}
              type="button"
              data-active={state.actor === option.value || undefined}
              onClick={() => patch({ actor: option.value })}
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
        emptyLabel={filtersActive ? "No entries match these filters." : "No changes recorded yet."}
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
