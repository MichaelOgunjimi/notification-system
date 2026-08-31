import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "./client";
import { AuthError } from "./error";

const user = {
  id: "user-1",
  email: "person@example.com",
  name: "Person",
  isActive: true,
  emailVerifiedAt: "2026-08-31T10:00:00Z",
  createdAt: "2026-08-31T09:00:00Z",
};

function fetchAdapter(handler: (input: RequestInfo | URL, init?: RequestInit) => Response) {
  return vi.fn(handler) as unknown as typeof globalThis.fetch;
}

describe("createAuthClient", () => {
  it("normalizes an email before requesting a magic link", async () => {
    const fetcher = fetchAdapter(() => Response.json({ message: "sent" }, { status: 202 }));
    const client = createAuthClient({ appAuthPath: "/identity", fetch: fetcher });

    await client.sendMagicLink({ email: "  Person@Example.COM " });

    expect(fetcher).toHaveBeenCalledWith(
      "/identity/magic-link/request",
      expect.objectContaining({
        body: JSON.stringify({ email: "person@example.com" }),
        credentials: "same-origin",
        method: "POST",
      }),
    );
  });

  it("models an unauthenticated session as a null user", async () => {
    const client = createAuthClient({
      fetch: fetchAdapter(() => Response.json({ detail: "Not authenticated." }, { status: 401 })),
    });

    await expect(client.getCurrentUser()).resolves.toBeNull();
  });

  it("exchanges a one-time OAuth code without accepting browser token values", async () => {
    const fetcher = fetchAdapter(() => Response.json(user));
    const client = createAuthClient({ fetch: fetcher });

    await expect(client.completeOAuthSignIn({ code: "one-time-code" })).resolves.toEqual(user);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/oauth/exchange",
      expect.objectContaining({ body: JSON.stringify({ code: "one-time-code" }) }),
    );
  });

  it("returns structured, retry-aware errors", async () => {
    const client = createAuthClient({
      fetch: fetchAdapter(() =>
        Response.json(
          { error: { code: "service_unavailable", message: "Email is required." } },
          { status: 503 },
        ),
      ),
    });

    const error = await client.sendMagicLink({ email: "" }).catch((reason) => reason);

    expect(error).toBeInstanceOf(AuthError);
    expect(error).toMatchObject({
      code: "service_unavailable",
      message: "Email is required.",
      retryable: true,
      status: 503,
    });
  });
});
