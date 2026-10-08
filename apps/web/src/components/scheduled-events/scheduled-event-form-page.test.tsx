import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  keys: undefined as unknown,
  templates: [] as unknown[],
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ success: vi.fn() }) }));
vi.mock("@beaco/control-plane/react", () => ({
  useProjectApiKeys: () => mocks.keys,
  useProjectTemplates: () => ({ data: { items: mocks.templates }, isPending: false }),
  useProjectTemplateDefaults: () => ({ data: { items: [] }, isPending: false }),
  useCreateProjectScheduledEvent: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
  }),
}));

import { ScheduledEventFormPage } from "./scheduled-event-form-page";

const project = { id: "p1", slug: "primary", name: "Primary" } as never;
const organization = (capabilities: string[]) =>
  ({ id: "o1", slug: "acme", name: "Acme", capabilities }) as never;

const key = (overrides: Record<string, unknown>) => ({
  id: "k1",
  name: "Live ingest",
  keyPrefix: "nk_live_ab",
  environment: "live",
  isActive: true,
  revokedAt: null,
  scopes: ["scheduled_events:write"],
  ...overrides,
});

const keysResult = (items: unknown[]) => ({
  data: { items },
  isPending: false,
  isError: false,
});

const render = (capabilities = ["project:deliveries:manage"]) =>
  renderToStaticMarkup(
    <ScheduledEventFormPage organization={organization(capabilities)} project={project} />,
  );

beforeEach(() => {
  mocks.keys = keysResult([key({})]);
  mocks.templates = [];
});

describe("ScheduledEventFormPage", () => {
  it("shows the sections the brief asks for", () => {
    const html = render();
    for (const text of [
      "Send as",
      "Event type",
      "Content",
      "Recipients",
      "When",
      "Schedule event",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("Payload / template variables (JSON)");
    expect(html).toContain("Add recipient");
  });

  it("preselects the key when exactly one can schedule", () => {
    expect(render()).toContain("Live ingest");
  });

  it("asks the user to choose when several keys qualify", () => {
    mocks.keys = keysResult([key({}), key({ id: "k2", name: "Worker" })]);
    const html = render();
    expect(html).toContain("Choose an API key");
    expect(html).not.toContain("Live ingest");
  });

  it("explains when no key can schedule and links to key management", () => {
    mocks.keys = keysResult([
      key({ revokedAt: "2026-10-01T00:00:00Z" }),
      key({ id: "k2", scopes: ["events:write"] }),
    ]);
    const html = render();
    expect(html).toContain("No active key has the");
    expect(html).toContain('href="/app/acme/primary/settings/security"');
  });

  it("states the UTC offset the time is sent with", () => {
    expect(render()).toMatch(
      /Your local time, UTC[+-]\d{2}:\d{2}\. Sent as \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00[+-]\d{2}:\d{2}/,
    );
  });

  it("does not offer the form to roles that cannot manage deliveries", () => {
    const html = render(["project:deliveries:read"]);
    expect(html).toContain("Your role cannot schedule events for this project.");
    expect(html).not.toContain("Schedule event</button>");
  });
});
