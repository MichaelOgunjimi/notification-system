import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantScheduledEvent } from "@beaco/control-plane";

const mocks = vi.hoisted(() => ({
  query: undefined as unknown,
  calls: [] as unknown[],
  params: new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/ui/use-remembered-search-params", () => ({
  useRememberedSearchParams: () => ({ params: mocks.params, replace: vi.fn() }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ success: vi.fn() }) }));
vi.mock("@beaco/control-plane/react", () => ({
  useProjectScheduledEvents: (_project: string, filter: unknown) => {
    mocks.calls.push(filter);
    return mocks.query;
  },
  useCancelProjectScheduledEvent: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false }),
}));

import { ScheduledEventsPage } from "./scheduled-events-page";

const project = { id: "p1", slug: "primary", name: "Primary" } as never;
const organization = (capabilities: string[]) =>
  ({ id: "o1", slug: "acme", name: "Acme", capabilities }) as never;

const event = (overrides: Partial<TenantScheduledEvent>): TenantScheduledEvent => ({
  id: "11111111-2222-4333-8444-555555555555",
  eventType: "renewal.reminder",
  scheduledFor: "2026-10-20T09:00:00Z",
  priority: "medium",
  status: "pending",
  displayStatus: "pending",
  eventId: null,
  eventStatus: null,
  failureReason: null,
  apiKeyId: "k1",
  apiKeyName: "Live",
  apiKeyEnvironment: "live",
  contentSource: "inline",
  recipientCount: 3,
  channels: ["email", "sms"],
  firstRecipient: "ada@example.com",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...overrides,
});

const page = (items: TenantScheduledEvent[]) => ({
  data: { items, total: items.length, totalPages: 1 },
  isPending: false,
  isFetching: false,
  isError: false,
});

const render = (capabilities: string[] = ["project:deliveries:manage"]) =>
  renderToStaticMarkup(
    <ScheduledEventsPage organization={organization(capabilities)} project={project} />,
  );

beforeEach(() => {
  mocks.calls = [];
  mocks.params = new URLSearchParams();
  mocks.query = page([event({})]);
});

describe("ScheduledEventsPage", () => {
  it("offers a chip for every displayed status", () => {
    const html = render();
    for (const label of [
      "All",
      "Pending",
      "Dispatched",
      "Completed",
      "Partially failed",
      "Delivery failed",
      "Failed",
      "Expired",
      "Cancelled",
    ]) {
      expect(html).toContain(`>${label}</button>`);
    }
  });

  it("asks the API for the chosen displayed status, not a page-local filter", () => {
    mocks.params = new URLSearchParams("status=partially_failed&page=2");
    render();
    expect(mocks.calls.at(-1)).toEqual({ page: 2, perPage: 25, status: "partially_failed" });
  });

  it("captions the pending chip as a soonest-first queue", () => {
    mocks.params = new URLSearchParams("status=pending");
    expect(render()).toContain("Soonest first.");
    mocks.params = new URLSearchParams();
    expect(render()).toContain("Latest scheduled time first.");
  });

  it("labels rows with the displayed status and shows why a row failed", () => {
    mocks.query = page([
      event({
        id: "a",
        displayStatus: "completed",
        status: "dispatched",
        eventStatus: "completed",
      }),
      event({
        id: "b",
        displayStatus: "failed",
        status: "failed",
        failureReason: "Template 'x' not found",
      }),
    ]);
    const html = render();
    expect(html).toContain("Completed");
    expect(html).toContain("Template &#x27;x&#x27; not found");
    expect(html).toContain("ada@example.com +2 more");
  });

  it("links Schedule to the form for managers and hides it otherwise", () => {
    expect(render()).toContain('href="/app/acme/primary/scheduled-events/new"');
    expect(render(["project:deliveries:read"])).not.toContain("/scheduled-events/new");
  });

  it("offers cancel only on pending rows to managers", () => {
    mocks.query = page([
      event({ id: "a" }),
      event({ id: "b", displayStatus: "cancelled", status: "cancelled" }),
    ]);
    expect((render().match(/>Cancel<\/button>/g) ?? []).length).toBe(1);
    expect(render(["project:deliveries:read"])).not.toContain(">Cancel</button>");
  });

  it("points an empty project at the form, and an unprivileged one at the API", () => {
    mocks.query = page([]);
    expect(render()).toContain("Schedule an event");
    const viewer = render(["project:deliveries:read"]);
    expect(viewer).toContain("POST /scheduled-events");
    expect(viewer).not.toContain("Schedule an event");
  });
});
