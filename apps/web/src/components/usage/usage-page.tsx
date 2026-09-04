"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Organization, Project, UsageEntry } from "@beaco/control-plane";
import {
  useOrganizationAnalytics,
  useOrganizationTopEndpoints,
  useOrganizationTrends,
  useOrganizationUsage,
  useOrganizationUsageHourly,
  useOrganizationUsageSummary,
  useProjectAnalytics,
  useProjectApiKeys,
  useProjectTopEndpoints,
  useProjectTrends,
  useProjectUsage,
  useProjectUsageHourly,
  useProjectUsageSummary,
} from "@beaco/control-plane/react";
import { AppSelect } from "@/components/ui/app-select";
import { LogTable, type LogColumn } from "@/components/ui/log-table";
import { LogFilters } from "@/components/ui/log-filters";
import { TablePager } from "@/components/ui/table-pager";
import {
  LOG_PER_PAGE_OPTIONS,
  dateWindowFor,
  useLogUrlState,
} from "@/components/ui/use-log-url-state";
import { absoluteFormatter, relativeTime } from "@/lib/audit-log";
import { ChannelDonut, EndpointBars, HourlyHeatmap, TrendChart } from "./usage-charts";
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

const TOP_ENDPOINTS_LIMIT = 8;
/** A practical stand-in for "unbounded" on the notification-domain endpoints
 * (analytics/trends), which default to "today" when `from` is omitted —
 * unlike the usage endpoints, which are genuinely unbounded with no `from`. */
const ANALYTICS_UNBOUNDED_SPAN_MS = 2 * 365 * 24 * 60 * 60 * 1000;

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
 * Tenant API usage — request volume per API key and endpoint, delivery
 * outcomes over time, and a totals summary for the selected scope, key, and
 * date range.
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
  const analyticsWindow = useMemo(
    () => ({
      from: dateWindow.from ?? new Date(Date.now() - ANALYTICS_UNBOUNDED_SPAN_MS).toISOString(),
      to: dateWindow.to,
    }),
    [dateWindow.from, dateWindow.to],
  );
  const granularity: "hour" | "day" = state.range === "24h" ? "hour" : "day";

  const scopeProjectId = canReadOrganization ? state.project : project.id;
  const apiKeyId = state.apiKeyId || undefined;

  // A key belongs to one project; drop a stale selection when the project changes.
  const previousScope = useRef(scopeProjectId);
  useEffect(() => {
    if (previousScope.current !== scopeProjectId) {
      previousScope.current = scopeProjectId;
      if (state.apiKeyId) patch({ apiKeyId: "" });
    }
  }, [scopeProjectId, state.apiKeyId, patch]);

  const keysQuery = useProjectApiKeys(scopeProjectId || null, { perPage: 50, status: "active" });

  const listFilter = { page: state.page, perPage: state.perPage, apiKeyId, ...dateWindow };
  const summaryFilter = { apiKeyId, ...dateWindow };
  const hourlyFilter = { apiKeyId, ...dateWindow };
  const topEndpointsFilter = { apiKeyId, limit: TOP_ENDPOINTS_LIMIT, ...dateWindow };
  const analyticsFilter = { apiKeyId, ...analyticsWindow };
  const trendsFilter = { apiKeyId, granularity, ...analyticsWindow };

  // Both scopes are always queried (each gated by its own `enabled`) so hook
  // order stays stable as the project filter toggles between a specific
  // project and org-wide — conditionally calling one or the other would
  // violate the rules of hooks.
  const orgWide = canReadOrganization && !scopeProjectId ? organization.id : null;
  const projectQuery = useProjectUsage(scopeProjectId || null, listFilter);
  const orgQuery = useOrganizationUsage(orgWide, listFilter);
  const query = scopeProjectId ? projectQuery : orgQuery;
  const projectSummary = useProjectUsageSummary(scopeProjectId || null, summaryFilter);
  const orgSummary = useOrganizationUsageSummary(orgWide, summaryFilter);
  const summary = scopeProjectId ? projectSummary : orgSummary;
  const projectHourly = useProjectUsageHourly(scopeProjectId || null, hourlyFilter);
  const orgHourly = useOrganizationUsageHourly(orgWide, hourlyFilter);
  const hourly = scopeProjectId ? projectHourly : orgHourly;
  const projectTopEndpoints = useProjectTopEndpoints(scopeProjectId || null, topEndpointsFilter);
  const orgTopEndpoints = useOrganizationTopEndpoints(orgWide, topEndpointsFilter);
  const topEndpoints = scopeProjectId ? projectTopEndpoints : orgTopEndpoints;
  const projectAnalytics = useProjectAnalytics(scopeProjectId || null, analyticsFilter);
  const orgAnalytics = useOrganizationAnalytics(orgWide, analyticsFilter);
  const analytics = scopeProjectId ? projectAnalytics : orgAnalytics;
  const projectTrends = useProjectTrends(scopeProjectId || null, trendsFilter);
  const orgTrends = useOrganizationTrends(orgWide, trendsFilter);
  const trends = scopeProjectId ? projectTrends : orgTrends;

  const entries = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = query.data ? Math.max(1, query.data.totalPages) : 1;

  const peakHour = useMemo(() => {
    const points = hourly.data ?? [];
    if (!points.some((point) => point.requestCount > 0)) return null;
    return points.reduce((best, point) => (point.requestCount > best.requestCount ? point : best))
      .hour;
  }, [hourly.data]);

  const endpointCount = topEndpoints.data?.length ?? 0;
  const endpointCountLabel =
    endpointCount === 0
      ? "—"
      : `${endpointCount}${endpointCount === TOP_ENDPOINTS_LIMIT ? "+" : ""}`;

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

  const filtersActive = state.range !== "all" || state.project !== "" || state.apiKeyId !== "";

  return (
    <div className="usage-page">
      <header className="usage-page__heading">
        <div>
          <p>Observability</p>
          <h1>Usage</h1>
          <span>Request volume and delivery outcomes per API key, over time.</span>
        </div>
        <span className="usage-page__tag" title="Refreshes automatically">
          <span className="usage-page__live" aria-hidden />
          {query.data ? `${query.data.total.toLocaleString()} buckets` : "Counting…"}
        </span>
      </header>

      <LogFilters
        value={state}
        onChange={patch}
        projects={canReadOrganization ? projects : [project]}
        hideSearch
      >
        <AppSelect
          aria-label="API key"
          containerClassName="usage-page__key-select"
          value={state.apiKeyId}
          onValueChange={(apiKeyId) => patch({ apiKeyId })}
          disabled={!scopeProjectId}
          placeholder={scopeProjectId ? "All keys" : "Pick a project first"}
          options={[
            { value: "", label: "All keys" },
            ...(keysQuery.data?.items ?? []).map((key) => ({
              value: key.id,
              label: `${key.name} · ${key.environment}`,
            })),
          ]}
        />
      </LogFilters>

      <div className="usage-page__stats">
        <div className="usage-page__stat">
          <span>Total requests</span>
          <strong>{summary.data ? formatCount(summary.data.totalRequests) : "—"}</strong>
        </div>
        <div className="usage-page__stat" data-tone="success">
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
        <div className="usage-page__stat">
          <span>Endpoints hit</span>
          <strong>{endpointCountLabel}</strong>
        </div>
        <div className="usage-page__stat">
          <span>Peak hour</span>
          <strong>{peakHour !== null ? `${String(peakHour).padStart(2, "0")}:00` : "—"}</strong>
          {peakHour !== null ? <em>UTC</em> : null}
        </div>
        <div className="usage-page__stat">
          <span>Avg latency</span>
          <strong>
            {analytics.data?.avgDeliveryLatencyMs != null
              ? `${Math.round(analytics.data.avgDeliveryLatencyMs)}ms`
              : "—"}
          </strong>
        </div>
      </div>

      <div className="usage-page__charts">
        <section className="usage-page__chart usage-page__chart--wide">
          <header>
            <h2>Delivery status over time</h2>
            <p>Delivered, failed, queued, and processing notifications per {granularity}.</p>
          </header>
          <TrendChart points={trends.data?.points ?? []} granularity={granularity} />
        </section>
        <section className="usage-page__chart usage-page__chart--wide">
          <header>
            <h2>Hourly distribution</h2>
            <p>Request intensity by hour of day, UTC.</p>
          </header>
          <HourlyHeatmap
            points={
              hourly.data ?? Array.from({ length: 24 }, (_, hour) => ({ hour, requestCount: 0 }))
            }
          />
        </section>
        <section className="usage-page__chart usage-page__chart--endpoints">
          <header>
            <h2>Top endpoints</h2>
            <p>By request count.</p>
          </header>
          <EndpointBars rows={topEndpoints.data ?? []} />
        </section>
        <section className="usage-page__chart">
          <header>
            <h2>Channel mix</h2>
            <p>Notifications by delivery channel.</p>
          </header>
          <ChannelDonut stats={analytics.data?.channelStats ?? []} />
        </section>
      </div>

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
