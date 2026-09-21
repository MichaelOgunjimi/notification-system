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

describe("HttpClient baseUrl safety", () => {
  it("rejects a non-loopback HTTP baseUrl by default", () => {
    expect(() => new Beaco({ apiKey: "secret", baseUrl: "http://api.example.com/v1" })).toThrow(
      /must use HTTPS/,
    );
  });

  it("allows loopback HTTP without opting in", () => {
    expect(
      () => new Beaco({ apiKey: "secret", baseUrl: "http://localhost:8000/v1" }),
    ).not.toThrow();
  });

  it("allows a non-loopback HTTP baseUrl when explicitly opted in", () => {
    expect(
      () =>
        new Beaco({
          apiKey: "secret",
          baseUrl: "http://internal.example.net/v1",
          allowInsecureHttp: true,
        }),
    ).not.toThrow();
  });
});

describe("HttpClient request body and cancellation", () => {
  it("does not mask a body serialization failure as a NETWORK_ERROR", async () => {
    // templates.preview has no Zod schema in front of it, so this exercises
    // HttpClient.request's own JSON.stringify directly.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    const client = new Beaco({ apiKey: "secret", fetch });

    const error = await client.templates.preview("template-1", circular).catch((reason) => reason);

    expect(error).not.toBeInstanceOf(BeacoError);
    expect(error).toBeInstanceOf(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rethrows the caller's own AbortSignal reason instead of wrapping it", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled by caller");
    const fetch = vi.fn(async () => {
      controller.abort(reason);
      throw new DOMException("This operation was aborted", "AbortError");
    }) as unknown as typeof globalThis.fetch;
    const client = new Beaco({ apiKey: "secret", fetch });

    const error = await client.suppressions
      .list({ signal: controller.signal })
      .catch((rejection) => rejection);

    expect(error).toBe(reason);
  });
});
