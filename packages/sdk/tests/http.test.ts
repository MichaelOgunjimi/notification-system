import { describe, expect, it, vi } from "vitest";
import { BeacoError } from "../src";
import { Beaco } from "../src";

describe("HttpClient network failures", () => {
  it("wraps a thrown fetch error as a retryable NETWORK_ERROR", async () => {
    const cause = new TypeError("fetch failed");
    const fetch = vi.fn().mockRejectedValue(cause) as unknown as typeof globalThis.fetch;
    const client = new Beaco({ apiKey: "secret", fetch });

    const error = await client.suppressions.list().catch((reason) => reason);

    expect(error).toBeInstanceOf(BeacoError);
    expect(error).toMatchObject({ code: "NETWORK_ERROR", status: 0, retryable: true, cause });
  });
});

describe("BeacoError retryable classification", () => {
  const cases: Array<{ status: number; retryable: boolean }> = [
    { status: 400, retryable: false },
    { status: 401, retryable: false },
    { status: 404, retryable: false },
    { status: 422, retryable: false },
    { status: 429, retryable: true },
    { status: 500, retryable: true },
    { status: 503, retryable: true },
  ];

  it.each(cases)("status $status -> retryable $retryable", async ({ status, retryable }) => {
    const fetch = vi.fn(async () =>
      Response.json({ error: { code: "API_ERROR", message: "failed" } }, { status }),
    ) as unknown as typeof globalThis.fetch;
    const client = new Beaco({ apiKey: "secret", fetch });

    const error = await client.suppressions.list().catch((reason) => reason);

    expect(error).toBeInstanceOf(BeacoError);
    expect(error).toMatchObject({ status, retryable });
  });
});
