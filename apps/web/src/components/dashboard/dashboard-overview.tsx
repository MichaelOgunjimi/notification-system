"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight,
  CalendarBlank,
  ChartLineUp,
  Clock,
  Gauge,
  Key,
  PaperPlaneTilt,
  Pulse,
  SpinnerGap,
  TrendUp,
  WarningCircle,
} from "@phosphor-icons/react";
import { useProjectAnalytics, useProjectEvents } from "@beaco/control-plane/react";
import { LogFilters, type DateRangeKey } from "@/components/ui/log-filters";
import { dateWindowFor, useLogUrlState } from "@/components/ui/use-log-url-state";
import { relativeTime } from "@/lib/audit-log";
import { docsUrl } from "@/lib/urls";
import { useDashboardScope } from "./dashboard-scope-context";

const STATUS_LABEL: Readonly<Record<string, string>> = {
  accepted: "Accepted",
  processing: "Processing",
  completed: "Completed",
  partially_failed: "Partially failed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const RANGE_LABEL: Readonly<Record<DateRangeKey, string>> = {
  all: "All time",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Custom range",
};

function statusTone(status: string): "success" | "danger" | "warning" | "muted" {
  if (status === "completed") return "success";
  if (status === "failed" || status === "cancelled") return "danger";
  if (status === "processing" || status === "partially_failed") return "warning";
  return "muted";
}

/**
 * Renders project-scoped delivery health and recent events for the resolved dashboard URL.
 *
 * Query failures stay isolated so available analytics or events remain useful. Placeholder data
 * is hidden while the project changes to prevent the previous project's data crossing scopes.
 *
 * @returns The active project's delivery overview, including onboarding for an empty project.
 */
export function DashboardOverview() {
  const { organization, project } = useDashboardScope();
  const { state, patch } = useLogUrlState();
  const dateWindow = useMemo(
    () => dateWindowFor(state.range, state.from, state.to),
    [state.range, state.from, state.to],
  );
  const analytics = useProjectAnalytics(project.id, dateWindow);
  const recentEvents = useProjectEvents(project.id, { page: 1, perPage: 5, ...dateWindow });
  const analyticsData = analytics.isPlaceholderData ? undefined : analytics.data;
  const eventsData = recentEvents.isPlaceholderData ? undefined : recentEvents.data;
  const analyticsLoading = analytics.isPending || analytics.isPlaceholderData;
  const eventsLoading = recentEvents.isPending || recentEvents.isPlaceholderData;
  const hasError = analytics.isError || recentEvents.isError;
  const basePath = `/app/${organization.slug}/${project.slug}`;
  const eventSearch = new URLSearchParams();
  if (state.range !== "all") eventSearch.set("range", state.range);
  if (state.range === "custom" && state.from) eventSearch.set("from", state.from);
  if (state.range === "custom" && state.to) eventSearch.set("to", state.to);
  const eventQuery = eventSearch.toString();
  const eventsHref = `${basePath}/events${eventQuery ? `?${eventQuery}` : ""}`;

  const metrics = [
    {
      label: "Events",
      value: analyticsData?.eventsToday.toLocaleString(),
      detail: RANGE_LABEL[state.range],
      icon: Pulse,
    },
    {
      label: "Success rate",
      value: analyticsData
        ? analyticsData.eventsToday > 0
          ? `${analyticsData.successRate.toFixed(1)}%`
          : "—"
        : undefined,
      detail: "Completed deliveries",
      icon: TrendUp,
    },
    {
      label: "Delivered",
      value: analyticsData?.notificationsDelivered.toLocaleString(),
      detail: "Successful notifications",
      icon: PaperPlaneTilt,
    },
    {
      label: "Failed",
      value: analyticsData?.notificationsFailed.toLocaleString(),
      detail: analyticsData
        ? `${analyticsData.dlqActive.toLocaleString()} active dead letters`
        : RANGE_LABEL[state.range],
      icon: WarningCircle,
    },
    {
      label: "In flight",
      value: analyticsData
        ? (
            analyticsData.notificationsQueued + analyticsData.notificationsProcessing
          ).toLocaleString()
        : undefined,
      detail: "Queued or processing",
      icon: Clock,
    },
    {
      label: "P95 latency",
      value: analyticsData
        ? analyticsData.p95DeliveryLatencyMs === null
          ? "—"
          : `${Math.round(analyticsData.p95DeliveryLatencyMs)} ms`
        : undefined,
      detail: "Delivery completion time",
      icon: Gauge,
    },
  ];

  return (
    <main className="dashboard-overview">
      <header className="dashboard-overview__heading">
        <div>
          <p>Project overview</p>
          <h1>{project.name}</h1>
          <span>Delivery health and the latest events for {organization.name}.</span>
        </div>
        <span
          className="dashboard-overview__status"
          data-tone={hasError ? "warning" : analyticsLoading || eventsLoading ? "loading" : "live"}
          role="status"
        >
          <i />
          {hasError
            ? "Partial data"
            : analyticsLoading || eventsLoading
              ? "Loading project data"
              : "Project data live"}
        </span>
      </header>

      <div className="dashboard-overview__filters">
        <span>
          <CalendarBlank size={14} /> Date range
        </span>
        <LogFilters value={state} onChange={patch} projects={[project]} hideSearch />
      </div>

      <section className="dashboard-overview__metrics" aria-labelledby="delivery-health-title">
        <div className="dashboard-overview__section-heading">
          <div>
            <span>Delivery health</span>
            <h2 id="delivery-health-title">{RANGE_LABEL[state.range]} at a glance</h2>
          </div>
          <Link href={`${basePath}/delivery`}>
            View delivery <ArrowRight size={13} />
          </Link>
        </div>

        {analytics.isError ? (
          <p className="dashboard-overview__message" role="alert">
            <WarningCircle size={15} /> Delivery metrics are unavailable. Recent events may still be
            current.
          </p>
        ) : null}

        <dl className="dashboard-overview__metric-grid" aria-busy={analyticsLoading}>
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label}>
                <dt>
                  <Icon size={15} /> {metric.label}
                </dt>
                <dd>
                  {metric.value === undefined
                    ? analytics.isError
                      ? "Unavailable"
                      : "Loading…"
                    : metric.value}
                </dd>
                <span>{metric.detail}</span>
              </div>
            );
          })}
        </dl>
      </section>

      <section className="dashboard-overview__events" aria-labelledby="recent-events-title">
        <div className="dashboard-overview__section-heading">
          <div>
            <span>Recent activity</span>
            <h2 id="recent-events-title">Latest events</h2>
          </div>
          {eventsData && eventsData.total > 0 ? (
            <Link href={eventsHref}>
              View all {eventsData.total.toLocaleString()} <ArrowRight size={13} />
            </Link>
          ) : null}
        </div>

        {eventsLoading ? (
          <p className="dashboard-overview__message" role="status">
            <SpinnerGap className="animate-spin" size={15} /> Loading recent events
          </p>
        ) : null}

        {recentEvents.isError ? (
          <p className="dashboard-overview__message" role="alert">
            <WarningCircle size={15} /> Recent events are unavailable. Delivery metrics may still be
            current.
          </p>
        ) : null}

        {eventsData?.items.length ? (
          <div className="dashboard-overview__event-list">
            <div className="dashboard-overview__event-columns" aria-hidden>
              <span>Event</span>
              <span>Status</span>
              <span>Received</span>
              <span />
            </div>
            <ul>
              {eventsData.items.map((event) => {
                const status =
                  event.hasFailures && event.status === "completed"
                    ? "partially_failed"
                    : event.status;
                return (
                  <li key={event.id}>
                    <Link href={`${basePath}/events/${event.id}`}>
                      <span className="dashboard-overview__event-name">
                        <strong>{event.eventType}</strong>
                        <small>{event.id}</small>
                      </span>
                      <span
                        className="dashboard-overview__event-status"
                        data-tone={statusTone(status)}
                      >
                        <i /> {STATUS_LABEL[status] ?? status}
                      </span>
                      <time dateTime={event.createdAt}>{relativeTime(event.createdAt)}</time>
                      <ArrowRight size={14} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {eventsData?.total === 0 ? (
          <div className="dashboard-overview__empty">
            <span>
              <ChartLineUp size={22} />
            </span>
            <div>
              <strong>
                {state.range === "all" ? "Send your first event" : "No events in this range"}
              </strong>
              <p>
                {state.range === "all"
                  ? "Create a project API key, then follow the quickstart to see delivery data here."
                  : "Try another date range to find earlier delivery activity."}
              </p>
            </div>
            {state.range === "all" ? (
              <div className="dashboard-overview__actions">
                <Link href={`${basePath}/settings/security`}>
                  <Key size={14} /> Create an API key
                </Link>
                <a href={docsUrl("/quickstart")}>
                  Open quickstart <ArrowRight size={13} />
                </a>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
