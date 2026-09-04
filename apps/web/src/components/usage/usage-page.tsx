"use client";

import { useMemo } from "react";
import type { Organization, Project, UsageEntry } from "@beaco/control-plane";
import {
  useOrganizationUsage,
  useOrganizationUsageSummary,
  useProjectUsage,
  useProjectUsageSummary,
} from "@beaco/control-plane/react";
import { LogTable, type LogColumn } from "@/components/ui/log-table";
import { LogFilters } from "@/components/ui/log-filters";
import { TablePager } from "@/components/ui/table-pager";
import {
  LOG_PER_PAGE_OPTIONS,
  dateWindowFor,
  useLogUrlState,
} from "@/components/ui/use-log-url-state";
import { absoluteFormatter, relativeTime } from "@/lib/audit-log";
import "./usage-page.css";

/** Props for {@link UsagePage}. */
type UsagePageProps = Readonly<{
  /** Active organization. */
  organization: Organization;
  /** Active project (the fallback scope without `organization:usage:read`). */
  project: Project;
  /** Sibling projects offered by the project filter. */
  projects: readonly Project[];
}>;

/**
 * Formats a request count as a locale-grouped integer.
 *
 * @param value Non-negative request count.
 * @returns The count with thousands separators, e.g. `12,480`.
 */
function formatCount(value: number): string {
  return value.toLocaleString();
}

/**
 * Formats the successful share of a request total as a whole-number percentage.
 *
 * @param successful Successful request count.
 * @param total Total request count.
 * @returns A percentage string, or `"—"` when there were no requests.
 */
function successRate(successful: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((successful / total) * 100)}%`;
}

/**
 * Tenant API usage — request volume per API key and endpoint, hour by hour,
 * with a totals-and-outcome summary for the selected scope and date range.
 *
 * @param props Active organization, project, and the sibling project list.
 * @returns The usage surface.
 */
export function UsagePage({ organization, project, projects }: UsagePageProps) {
  const { state, patch } = useLogUrlState();
  const canReadOrganization = useMemo(
    () => new Set(organization.capabilities).has("organization:usage:read"),
    [organization.capabilities],
  );

  const dateWindow = useMemo(
    () => dateWindowFor(state.range, state.from, state.to),
    [state.range, state.from, state.to],
  );

  const listFilter = { page: state.page, perPage: state.perPage, ...dateWindow };
  const summaryFilter = dateWindow;

  const scopeProjectId = canReadOrganization ? state.project : project.id;
  const orgQuery = useOrganizationUsage(
    canReadOrganization && !scopeProjectId ? organization.id : null,
    listFilter,
  );
  const projectQuery = useProjectUsage(scopeProjectId || null, listFilter);
  const query = scopeProjectId ? projectQuery : orgQuery;

  const orgSummary = useOrganizationUsageSummary(
    canReadOrganization && !scopeProjectId ? organization.id : null,
    summaryFilter,
  );
  const projectSummary = useProjectUsageSummary(scopeProjectId || null, summaryFilter);
  const summary = scopeProjectId ? projectSummary : orgSummary;

  const entries = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = query.data ? Math.max(1, query.data.totalPages) : 1;

  const columns: ReadonlyArray<LogColumn<UsageEntry>> = [
    {
      key: "hour",
      label: "Hour",
      width: "108px",
      render: (entry) => (
        <time
          className="usage-page__time"
          dateTime={entry.hourBucket}
          title={absoluteFormatter.format(new Date(entry.hourBucket))}
        >
          {relativeTime(entry.hourBucket)}
        </time>
      ),
    },
    {
      key: "key",
      label: "API key",
      width: "minmax(150px, 220px)",
      render: (entry) => (
        <span className="usage-page__key">
          {entry.apiKeyName}
          <span className="usage-page__env">{entry.apiKeyEnvironment}</span>
        </span>
      ),
    },
    {
      key: "endpoint",
      label: "Endpoint",
      width: "minmax(200px, 1fr)",
      render: (entry) => <span className="usage-page__endpoint">{entry.endpoint}</span>,
    },
    {
      key: "requests",
      label: "Requests",
      width: "100px",
      render: (entry) => (
        <span className="usage-page__count">{formatCount(entry.requestCount)}</span>
      ),
    },
  ];

  const filtersActive = state.range !== "all" || state.project !== "";

  return (
    <div className="usage-page">
      <header className="usage-page__heading">
        <div>
          <p>Observability</p>
          <h1>Usage</h1>
          <span>Request volume per API key and endpoint, hour by hour.</span>
        </div>
        <span className="usage-page__tag" title="Refreshes automatically">
          <span className="usage-page__live" aria-hidden />
          {query.data ? `${query.data.total.toLocaleString()} buckets` : "Counting…"}
        </span>
      </header>

      <div className="usage-page__summary">
        <div className="usage-page__stat">
          <span>Total requests</span>
          <strong>{summary.data ? formatCount(summary.data.totalRequests) : "—"}</strong>
        </div>
        <div className="usage-page__stat">
          <span>Successful</span>
          <strong>{summary.data ? formatCount(summary.data.successfulRequests) : "—"}</strong>
          <em>
            {summary.data
              ? successRate(summary.data.successfulRequests, summary.data.totalRequests)
              : null}
          </em>
        </div>
        <div className="usage-page__stat" data-tone="danger">
          <span>Failed</span>
          <strong>{summary.data ? formatCount(summary.data.failedRequests) : "—"}</strong>
        </div>
        <div className="usage-page__stat usage-page__stat--environments">
          <span>By environment</span>
          {summary.data && summary.data.byEnvironment.length > 0 ? (
            <ul>
              {summary.data.byEnvironment.map((row) => (
                <li key={row.environment}>
                  <b>{row.environment}</b>
                  {formatCount(row.totalRequests)} ·{" "}
                  {successRate(row.successfulRequests, row.totalRequests)} success
                </li>
              ))}
            </ul>
          ) : (
            <strong>—</strong>
          )}
        </div>
      </div>

      <LogFilters
        value={state}
        onChange={patch}
        projects={canReadOrganization ? projects : [project]}
        hideSearch
      />

      <LogTable
        columns={columns}
        rows={entries}
        rowKey={(entry) => `${entry.apiKeyId}-${entry.endpoint}-${entry.hourBucket}`}
        renderExpanded={(entry) => (
          <dl className="log-table__detail-grid">
            <div>
              <dt>Hour bucket</dt>
              <dd>{absoluteFormatter.format(new Date(entry.hourBucket))}</dd>
            </div>
            <div>
              <dt>API key</dt>
              <dd>
                {entry.apiKeyName} · {entry.apiKeyId}
              </dd>
            </div>
            <div>
              <dt>Project</dt>
              <dd>{entry.projectId}</dd>
            </div>
          </dl>
        )}
        pending={query.isPending}
        busy={query.isFetching}
        error={query.isError ? query.error.message : null}
        emptyLabel={filtersActive ? "No usage matches these filters." : "No requests recorded yet."}
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
