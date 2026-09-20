import { describe, expect, it, vi } from "vitest";
import { Beaco } from "../src";

function fetcher(response: Response) {
  return vi.fn(async () => response) as unknown as typeof globalThis.fetch;
}

const emptyPage = { items: [], total: 0, page: 1, per_page: 20, total_pages: 0 };

describe("EventsResource", () => {
  it("publishes a batch of events", async () => {
    const fetch = fetcher(
      Response.json([
        {
          id: "event-1",
          event_type: "user.welcome",
          priority: "medium",
          status: "accepted",
          recipient_count: 1,
          has_failures: false,
          idempotency_key: null,
          created_at: "2026-09-20T10:00:00Z",
          updated_at: "2026-09-20T10:00:00Z",
        },
      ]),
    );
    const client = new Beaco({ apiKey: "secret", baseUrl: "https://example.test/v1", fetch });

    const events = await client.events.publishBatch([
      { eventType: "user.welcome", recipients: [{ channels: ["email"], email: "a@example.com" }] },
    ]);

    expect(events).toMatchObject([{ eventType: "user.welcome", recipientCount: 1 }]);
    expect(fetch).toHaveBeenCalledWith("https://example.test/v1/events/batch", expect.anything());
  });

  it("lists and retrieves events", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(emptyPage))
      .mockResolvedValueOnce(
        Response.json({
          id: "event-1",
          event_type: "user.welcome",
          priority: "medium",
          status: "completed",
          recipient_count: 1,
          has_failures: false,
          idempotency_key: null,
          created_at: "2026-09-20T10:00:00Z",
          updated_at: "2026-09-20T10:00:00Z",
          template_id: null,
          payload: { name: "Alice" },
          metadata: null,
          batch_id: null,
          notifications: [],
        }),
      );
    const client = new Beaco({
      apiKey: "secret",
      baseUrl: "https://example.test/v1",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    await client.events.list({ status: "completed" });
    const event = await client.events.retrieve("event-1");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://example.test/v1/events?status=completed",
      "https://example.test/v1/events/event-1",
    ]);
    expect(event).toMatchObject({ payload: { name: "Alice" }, notifications: [] });
  });
});

describe("TemplatesResource", () => {
  it("lists, retrieves, updates, and previews templates", async () => {
    const apiTemplate = {
      id: "template-1",
      project_id: "project-1",
      api_key_id: "key-1",
      name: "welcome",
      channel: "email",
      subject: "Welcome",
      body: "Hello {{ name }}",
      variables: ["name"],
      is_active: true,
      created_at: "2026-09-20T10:00:00Z",
      updated_at: "2026-09-20T10:00:00Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(emptyPage))
      .mockResolvedValueOnce(Response.json(apiTemplate))
      .mockResolvedValueOnce(Response.json({ ...apiTemplate, subject: "Updated" }))
      .mockResolvedValueOnce(Response.json({ subject: "Updated", body: "Hello Alice" }));
    const client = new Beaco({
      apiKey: "secret",
      baseUrl: "https://example.test/v1",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    await client.templates.list({ channel: "email" });
    await client.templates.retrieve("template-1");
    const updated = await client.templates.update("template-1", { subject: "Updated" });
    const preview = await client.templates.preview("template-1", { name: "Alice" });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://example.test/v1/templates?channel=email",
      "https://example.test/v1/templates/template-1",
      "https://example.test/v1/templates/template-1",
      "https://example.test/v1/templates/template-1/preview",
    ]);
    expect(updated).toMatchObject({ subject: "Updated" });
    expect(preview).toMatchObject({ subject: "Updated", body: "Hello Alice" });
  });
});

describe("NotificationsResource", () => {
  it("retrieves a notification with delivery logs", async () => {
    const fetch = fetcher(
      Response.json({
        id: "notification-1",
        event_id: "event-1",
        channel: "email",
        status: "delivered",
        recipient_address: "user@example.com",
        retry_count: 0,
        max_retries: 3,
        rendered_subject: "Welcome",
        error_message: null,
        delivered_at: "2026-09-20T10:00:00Z",
        failed_at: null,
        next_retry_at: null,
        created_at: "2026-09-20T10:00:00Z",
        updated_at: "2026-09-20T10:00:00Z",
        priority: "medium",
        recipient_user_id: "user-1",
        rendered_body: "Hello",
        notification_logs: [
          {
            id: "log-1",
            status: "delivered",
            message: null,
            attempt_number: 1,
            created_at: "2026-09-20T10:00:00Z",
          },
        ],
      }),
    );
    const client = new Beaco({ apiKey: "secret", fetch });

    const notification = await client.notifications.retrieve("notification-1");

    expect(notification).toMatchObject({
      recipientUserId: "user-1",
      renderedBody: "Hello",
      notificationLogs: [{ id: "log-1", attemptNumber: 1 }],
    });
  });
});

describe("SuppressionsResource", () => {
  it("lists and deletes suppressions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(emptyPage))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new Beaco({
      apiKey: "secret",
      baseUrl: "https://example.test/v1",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    await client.suppressions.list({ channel: "email" });
    await expect(client.suppressions.delete("suppression-1")).resolves.toBeUndefined();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://example.test/v1/suppressions?channel=email",
      "https://example.test/v1/suppressions/suppression-1",
    ]);
  });
});

describe("ScheduledEventsResource", () => {
  it("lists scheduled events", async () => {
    const fetch = fetcher(Response.json(emptyPage));
    const client = new Beaco({ apiKey: "secret", baseUrl: "https://example.test/v1", fetch });

    await client.scheduledEvents.list({ status: "pending" });

    expect(fetch).toHaveBeenCalledWith(
      "https://example.test/v1/scheduled-events?status=pending",
      expect.anything(),
    );
  });
});
