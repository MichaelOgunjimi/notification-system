import { describe, expect, it, vi } from "vitest";
import { AuthError } from "../error";
import type { AuthClient } from "../types";
import { sessionQuery } from "./queries";

const client = {
  getCurrentUser: vi.fn(),
} as unknown as AuthClient;

describe("sessionQuery", () => {
  it("retries temporary session failures without retrying an anonymous response", () => {
    const retry = sessionQuery(client).retry;

    expect(retry).toBeTypeOf("function");
    if (typeof retry !== "function") return;

    const temporaryFailure = new AuthError("Unavailable", 503);
    expect(retry(0, temporaryFailure)).toBe(true);
    expect(retry(1, temporaryFailure)).toBe(true);
    expect(retry(2, temporaryFailure)).toBe(false);
    expect(retry(0, new AuthError("Signed out", 401))).toBe(false);
  });
});
