import { describe, expect, it, vi } from "vitest";
import { Beaco } from "../src";
import { version } from "../package.json";

describe("user agent", () => {
  it("identifies the SDK so Cloudflare does not block it as an anonymous script", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ items: [] }));
    const client = new Beaco({ apiKey: "secret", baseUrl: "https://example.test/v1", fetch });

    await client.events.list().catch(() => undefined);

    const headers = fetch.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(`beaco-js/${version}`);
  });
});
