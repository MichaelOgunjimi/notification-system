import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analytics: undefined as unknown,
  analyticsCalls: [] as Array<readonly [string, unknown]>,
  events: undefined as unknown,
  eventCalls: [] as Array<readonly [string, unknown]>,
  dateWindow: { from: undefined as string | undefined, to: undefined as string | undefined },
  logState: {
    project: "",
    actor: "",
    apiKeyId: "",
    range: "all" as "all" | "24h" | "7d" | "30d" | "custom",
    from: "",
    to: "",
    action: "",
    page: 1,
    perPage: 25,
  },
  scope: {
    organization: { id: "org-1", name: "Acme", slug: "acme" },
    project: { id: "project-1", name: "Primary", slug: "primary" },
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@beaco/control-plane/react", () => ({
  useProjectAnalytics: (projectId: string, filter: unknown) => {
    mocks.analyticsCalls.push([projectId, filter]);
    return mocks.analytics;
  },
  useProjectEvents: (projectId: string, filter: unknown) => {
    mocks.eventCalls.push([projectId, filter]);
    return mocks.events;
  },
}));

vi.mock("@/components/ui/use-log-url-state", () => ({
  dateWindowFor: () => mocks.dateWindow,
  useLogUrlState: () => ({ state: mocks.logState, patch: vi.fn() }),
}));

vi.mock("./dashboard-scope-context", () => ({
  useDashboardScope: () => mocks.scope,
}));

import { DashboardOverview } from "./dashboard-overview";

const analyticsData = {
  eventsToday: 12,
  eventsCompleted: 10,
  eventsFailed: 1,
  eventsProcessing: 1,
  notificationsDelivered: 24,
  notificationsFailed: 2,
  notificationsProcessing: 1,
  notificationsQueued: 3,
  dlqActive: 2,
  successRate: 92.3,
  avgDeliveryLatencyMs: 320,
  p50DeliveryLatencyMs: 280,
  p95DeliveryLatencyMs: 900,
  p99DeliveryLatencyMs: 1200,
  channelStats: [],
};

const event = {
  id: "event-1",
  eventType: "invoice.paid",
  priority: "medium",
  status: "completed",
  recipientCount: 2,
  apiKeyId: "key-1",
  apiKeyName: "Production",
  apiKeyEnvironment: "live",
  hasFailures: false,
  createdAt: "2026-09-19T10:00:00Z",
};

function successfulQuery(data: unknown) {
  return {
    data,
    error: null,
    isError: false,
    isPending: false,
    isPlaceholderData: false,
    isSuccess: true,
  };
}

function pendingQuery(data?: unknown) {
  return {
    data,
    error: null,
    isError: false,
    isPending: data === undefined,
    isPlaceholderData: data !== undefined,
    isSuccess: false,
  };
}

function failedQuery() {
  return {
    data: undefined,
    error: new Error("Unavailable"),
    isError: true,
    isPending: false,
    isPlaceholderData: false,
    isSuccess: false,
  };
}

function renderOverview(): string {
  return renderToStaticMarkup(<DashboardOverview />);
}

describe("DashboardOverview", () => {
  beforeEach(() => {
    mocks.analytics = successfulQuery(analyticsData);
    mocks.events = successfulQuery({
      items: [event],
      total: 1,
      page: 1,
      perPage: 5,
      totalPages: 1,
    });
    mocks.analyticsCalls.length = 0;
    mocks.eventCalls.length = 0;
    mocks.dateWindow = { from: undefined, to: undefined };
    mocks.logState = { ...mocks.logState, range: "all", from: "", to: "" };
    mocks.scope.organization = { id: "org-1", name: "Acme", slug: "acme" };
    mocks.scope.project = { id: "project-1", name: "Primary", slug: "primary" };
  });

  it("shows delivery totals and linked recent events", () => {
    const html = renderOverview();

    expect(html).toContain("All time at a glance");
    expect(html).toContain("Success rate");
    expect(html).toContain("P95 latency");
    expect(html).toContain("92.3%");
    expect(html).toContain("900 ms");
    expect(html).toContain(">12<");
    expect(html).toContain(">24<");
    expect(html).toContain("invoice.paid");
    expect(html).toContain('href="/app/acme/primary/events/event-1"');
  });

  it("guides an empty project to API keys and the quickstart", () => {
    mocks.events = successfulQuery({ items: [], total: 0, page: 1, perPage: 5, totalPages: 1 });

    const html = renderOverview();

    expect(html).toContain("Send your first event");
    expect(html).toContain('href="/app/acme/primary/settings/security"');
    expect(html).toContain("/quickstart");
  });

  it("announces loading without inventing totals", () => {
    mocks.analytics = pendingQuery();
    mocks.events = pendingQuery();

    const html = renderOverview();

    expect(html).toContain("Loading project data");
    expect(html).toContain("Loading recent events");
    expect(html).toContain("Loading…");
    expect(html).not.toContain("Send your first event");
  });

  it("keeps successful data visible when the other query fails", () => {
    mocks.analytics = failedQuery();
    let html = renderOverview();

    expect(html).toContain("Delivery metrics are unavailable");
    expect(html).toContain("Unavailable");
    expect(html).toContain("invoice.paid");

    mocks.analytics = successfulQuery(analyticsData);
    mocks.events = failedQuery();
    html = renderOverview();

    expect(html).toContain("Recent events are unavailable");
    expect(html).toContain(">24<");
    expect(html).not.toContain("Send your first event");
  });

  it("reports complete failure when neither query has data", () => {
    mocks.analytics = failedQuery();
    mocks.events = failedQuery();

    const html = renderOverview();

    expect(html).toContain("Data unavailable");
    expect(html).not.toContain("Partial data");
  });

  it("queries the URL-resolved project and hides stale placeholder data", () => {
    mocks.scope.project = { id: "project-2", name: "Secondary", slug: "secondary" };
    mocks.analytics = pendingQuery(analyticsData);
    mocks.events = pendingQuery({ items: [event], total: 1, page: 1, perPage: 5, totalPages: 1 });

    const html = renderOverview();

    expect(mocks.analyticsCalls).toEqual([["project-2", mocks.dateWindow]]);
    expect(mocks.eventCalls).toEqual([["project-2", { page: 1, perPage: 5, ...mocks.dateWindow }]]);
    expect(html).toContain("Secondary");
    expect(html).toContain("Loading project data");
    expect(html).not.toContain("invoice.paid");
    expect(html).not.toContain(">12<");
  });

  it("scopes metrics, recent events, and the events link to the selected date range", () => {
    mocks.logState = {
      ...mocks.logState,
      range: "7d",
    };
    mocks.dateWindow = { from: "2026-09-12T10:00:00.000Z", to: undefined };

    const html = renderOverview();

    expect(html).toContain("Last 7 days at a glance");
    expect(html).toContain('href="/app/acme/primary/events?range=7d"');
    expect(mocks.analyticsCalls).toEqual([["project-1", mocks.dateWindow]]);
    expect(mocks.eventCalls).toEqual([["project-1", { page: 1, perPage: 5, ...mocks.dateWindow }]]);
  });
});
