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
  created_at: "2026-10-06T10:00:00Z",
  updated_at: "2026-10-06T10:00:00Z",
};

const base = {
  eventType: "order.confirmed",
  recipients: [{ channels: ["email" as const], email: "a@example.com" }],
  inline: { html: "<p>Thanks</p>" },
};

const file = { filename: "invoice.pdf", url: "https://files.example.com/a.pdf", sizeBytes: 1000 };

function setup() {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(apiEvent));
  const client = new Beaco({ apiKey: "secret", baseUrl: "https://example.test/v1", fetch });
  return { client, fetch };
}

describe("event attachments", () => {
  it("sends attachments as snake_case", async () => {
    const { client, fetch } = setup();

    await client.events.publish({ ...base, attachments: [file] });

    const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.attachments).toEqual([
      { filename: "invoice.pdf", url: "https://files.example.com/a.pdf", size_bytes: 1000 },
    ]);
  });

  it.each([
    ["non-http url", { ...file, url: "ftp://files.example.com/a.pdf" }],
    ["path in filename", { ...file, filename: "../a.pdf" }],
    ["zero size", { ...file, sizeBytes: 0 }],
  ])("rejects %s before any request", async (_name, attachment) => {
    const { client, fetch } = setup();

    await expect(client.events.publish({ ...base, attachments: [attachment] })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects too many attachments and oversized totals", async () => {
    const { client, fetch } = setup();

    await expect(
      client.events.publish({ ...base, attachments: Array(11).fill(file) }),
    ).rejects.toThrow();
    await expect(
      client.events.publish({
        ...base,
        attachments: [
          { ...file, sizeBytes: 20_000_000 },
          { ...file, sizeBytes: 20_000_000 },
        ],
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
