import { describe, expect, it, vi } from "vitest";
import { Beaco } from "../src";

const apiEvent = {
  id: "event-1",
  event_type: "order.confirmed",
  priority: "medium",
  status: "accepted",
  recipient_count: 1,
  has_failures: false,
  idempotency_key: null,
  created_at: "2026-10-02T10:00:00Z",
  updated_at: "2026-10-02T10:00:00Z",
};

const apiTemplate = {
  id: "template-1",
  project_id: "project-1",
  api_key_id: null,
  name: "order-confirmed",
  channel: "email",
  subject: null,
  body: "<p>Hi</p>",
  text_body: null,
  from_local: "billing",
  from_name: "Acme Billing",
  reply_to: "help@acme.example",
  variables: [],
  detected_variables: [],
  on_missing_variable: "error",
  is_active: true,
  created_at: "2026-10-02T10:00:00Z",
  updated_at: "2026-10-02T10:00:00Z",
};

function setup(body: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(body));
  const client = new Beaco({
    apiKey: "secret",
    baseUrl: "https://example.test/v1",
    fetch,
  });
  const sentBody = () =>
    JSON.parse(fetch.mock.calls[0]![1]!.body as string) as Record<string, unknown>;
  return { client, sentBody };
}

const recipients = [{ channels: ["email" as const], email: "a@example.com" }];

describe("inline email sender", () => {
  it("sends fromLocal, fromName and replyTo as snake_case", async () => {
    const { client, sentBody } = setup(apiEvent);

    await client.events.publish({
      eventType: "order.confirmed",
      recipients,
      inline: {
        subject: "Order confirmed",
        html: "<p>Thanks</p>",
        text: "Thanks",
        fromLocal: "orders",
        fromName: "Winwell Orders",
        replyTo: "support@winwell.example",
      },
    });

    expect(sentBody().inline).toEqual({
      subject: "Order confirmed",
      html: "<p>Thanks</p>",
      text: "Thanks",
      from_local: "orders",
      from_name: "Winwell Orders",
      reply_to: "support@winwell.example",
    });
  });

  it("omits sender fields when not set", async () => {
    const { client, sentBody } = setup(apiEvent);

    await client.events.publish({
      eventType: "order.confirmed",
      recipients,
      inline: { html: "<p>Thanks</p>" },
    });

    expect(sentBody().inline).toEqual({ html: "<p>Thanks</p>" });
  });

  it.each([
    ["fromLocal", "orders@evil.example"],
    ["fromLocal", "has space"],
    ["fromLocal", "UPPER"],
    ["fromLocal", "line\nbreak"],
    ["fromLocal", "orders\n"],
    ["fromName", "Line\nBreak"],
    ["fromName", "x y"],
    ["replyTo", "not-an-address"],
    ["replyTo", "a@b.com\nBcc: x@y.z"],
    ["replyTo", "a@b.com\n"],
  ])("rejects invalid %s locally: %j", async (field, value) => {
    const { client } = setup(apiEvent);

    await expect(
      client.events.publish({
        eventType: "order.confirmed",
        recipients,
        inline: { html: "<p>Thanks</p>", [field]: value },
      }),
    ).rejects.toThrow();
  });
});

describe("template sender", () => {
  it("creates a template with sender fields and maps them back", async () => {
    const { client, sentBody } = setup(apiTemplate);

    const template = await client.templates.create({
      name: "order-confirmed",
      channel: "email",
      body: "<p>Hi</p>",
      fromLocal: "billing",
      fromName: "Acme Billing",
      replyTo: "help@acme.example",
    });

    expect(sentBody()).toMatchObject({
      from_local: "billing",
      from_name: "Acme Billing",
      reply_to: "help@acme.example",
    });
    expect(sentBody()).not.toHaveProperty("fromLocal");
    expect(template).toMatchObject({
      fromLocal: "billing",
      fromName: "Acme Billing",
      replyTo: "help@acme.example",
    });
  });

  it("clears sender fields with null on update", async () => {
    const { client, sentBody } = setup({ ...apiTemplate, from_local: null, reply_to: null });

    const template = await client.templates.update("template-1", {
      fromLocal: null,
      replyTo: null,
    });

    expect(sentBody()).toEqual({ from_local: null, reply_to: null });
    expect(template.fromLocal).toBeNull();
    expect(template.replyTo).toBeNull();
  });

  it("rejects an invalid fromLocal on create", async () => {
    const { client } = setup(apiTemplate);

    await expect(
      client.templates.create({
        name: "x",
        channel: "email",
        body: "b",
        fromLocal: "Bad@Local",
      }),
    ).rejects.toThrow();
  });
});
