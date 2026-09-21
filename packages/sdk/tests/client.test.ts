import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { Beaco, BeacoError } from "../src";

function fetcher(response: Response) {
  return vi.fn(async () => response) as unknown as typeof globalThis.fetch;
}

describe("Beaco", () => {
  it("rejects unsafe client configuration", () => {
    expect(() => new Beaco({ apiKey: "" })).toThrow("apiKey is required");
    expect(() => new Beaco({ apiKey: "secret", timeoutMs: 0 })).toThrow(
      "timeoutMs must be greater than zero",
    );
  });

  it("validates JavaScript inputs before making a request", async () => {
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    const client = new Beaco({ apiKey: "secret", fetch });

    const error = await client.events
      .publish({ eventType: "", recipients: [] })
      .catch((reason) => reason);

    expect(error).toBeInstanceOf(ZodError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("publishes camelCase event input with API authentication", async () => {
    const fetch = fetcher(
      Response.json({
        id: "event-1",
        event_type: "user.welcome",
        priority: "medium",
        status: "accepted",
        recipient_count: 1,
        has_failures: false,
        idempotency_key: "welcome-1",
        created_at: "2026-09-20T10:00:00Z",
        updated_at: "2026-09-20T10:00:00Z",
      }),
    );
    const client = new Beaco({ apiKey: "secret", baseUrl: "https://example.test/v1/", fetch });

    await expect(
      client.events.publish({
        eventType: "user.welcome",
        recipients: [{ userId: "user-1", channels: ["email"], email: "a@example.com" }],
        payload: { firstName: "Ada" },
        idempotencyKey: "welcome-1",
      }),
    ).resolves.toMatchObject({ eventType: "user.welcome", recipientCount: 1 });

    expect(fetch).toHaveBeenCalledWith(
      "https://example.test/v1/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-API-Key": "secret" }),
        body: JSON.stringify({
          event_type: "user.welcome",
          recipients: [
            {
              user_id: "user-1",
              channels: ["email"],
              email: "a@example.com",
            },
          ],
          payload: { firstName: "Ada" },
          idempotency_key: "welcome-1",
        }),
      }),
    );
  });

  it("creates a template and supports empty delete responses", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
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
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 })) as typeof globalThis.fetch;
    const client = new Beaco({ apiKey: "secret", fetch });

    const template = await client.templates.create({
      name: "welcome",
      channel: "email",
      subject: "Welcome",
      body: "Hello {{ name }}",
      variables: ["name"],
    });
    await expect(client.templates.delete(template.id)).resolves.toBeUndefined();
    expect(template).toMatchObject({ projectId: "project-1", isActive: true });
  });

  it("exposes structured API errors", async () => {
    const client = new Beaco({
      apiKey: "secret",
      fetch: fetcher(
        Response.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Request validation failed",
              details: [{ field: "event_type", message: "Required" }],
            },
          },
          { status: 422 },
        ),
      ),
    });

    const error = await client.events
      .publish({
        eventType: "user.welcome",
        recipients: [{ channels: ["email"], email: "user@example.com" }],
      })
      .catch((e) => e);
    expect(error).toBeInstanceOf(BeacoError);
    expect(error).toMatchObject({
      code: "VALIDATION_ERROR",
      retryable: false,
      status: 422,
      details: [{ field: "event_type", message: "Required" }],
    });
  });

  it("routes notification, scheduled-event, and suppression operations", async () => {
    const emptyPage = { items: [], total: 0, page: 1, per_page: 20, total_pages: 0 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(emptyPage))
      .mockResolvedValueOnce(
        Response.json({
          id: "scheduled-1",
          api_key_id: "key-1",
          event_type: "report.ready",
          scheduled_for: "2026-10-01T09:00:00Z",
          priority: "medium",
          status: "pending",
          event_id: null,
          created_at: "2026-09-20T10:00:00Z",
          updated_at: "2026-09-20T10:00:00Z",
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({
          id: "suppression-1",
          api_key_id: "key-1",
          channel: "email",
          recipient: "user@example.com",
          reason: "manual",
          source: "client",
          created_at: "2026-09-20T10:00:00Z",
        }),
      );
    const fetch = fetchMock as typeof globalThis.fetch;
    const client = new Beaco({ apiKey: "secret", baseUrl: "https://example.test/v1", fetch });

    await client.notifications.list({ status: "failed", perPage: 10 });
    const scheduled = await client.scheduledEvents.create({
      eventType: "report.ready",
      scheduledFor: new Date("2026-10-01T09:00:00Z"),
      recipients: [{ channels: ["email"], email: "user@example.com" }],
    });
    await client.scheduledEvents.cancel(scheduled.id);
    const suppression = await client.suppressions.create({
      channel: "email",
      recipient: "user@example.com",
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://example.test/v1/notifications?status=failed&per_page=10",
      "https://example.test/v1/scheduled-events",
      "https://example.test/v1/scheduled-events/scheduled-1",
      "https://example.test/v1/suppressions",
    ]);
    expect(suppression).toMatchObject({ apiKeyId: "key-1", reason: "manual" });
  });
});
