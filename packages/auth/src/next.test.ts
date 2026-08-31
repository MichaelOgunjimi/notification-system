import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createNextAuthAdapter } from "./next";

const backendUser = {
  id: "user-1",
  email: "person@example.com",
  name: "Person",
  is_active: true,
  email_verified_at: "2026-08-31T10:00:00Z",
  created_at: "2026-08-31T09:00:00Z",
};

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`https://app.example.com${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("createNextAuthAdapter", () => {
  it("resolves a browser Session through the backend user endpoint", async () => {
    const fetcher = vi.fn(() => Promise.resolve(Response.json(backendUser)));
    const auth = createNextAuthAdapter({
      backendApiUrl: "http://api:8000/api/v1",
      publicBackendApiUrl: "https://api.example.com/api/v1",
      fetch: fetcher,
    });

    const response = await auth.session(
      request("/api/auth/session", "beaco_access_token=access-token"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "user-1",
      email: "person@example.com",
      name: "Person",
      isActive: true,
      emailVerifiedAt: "2026-08-31T10:00:00Z",
      createdAt: "2026-08-31T09:00:00Z",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "http://api:8000/api/v1/auth/me",
      expect.objectContaining({
        cache: "no-store",
        headers: { Authorization: "Bearer access-token" },
      }),
    );
  });

  it("refreshes an expired Session and replaces its HTTP-only cookies", async () => {
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        return Promise.resolve(
          Response.json({
            access_token: "new-access-token",
            refresh_token: "refresh-token",
            token_type: "bearer",
          }),
        );
      }
      if (fetcher.mock.calls.length === 1) {
        return Promise.resolve(Response.json({ detail: "Expired" }, { status: 401 }));
      }
      return Promise.resolve(Response.json(backendUser));
    });
    const auth = createNextAuthAdapter({
      backendApiUrl: "http://api:8000/api/v1/",
      publicBackendApiUrl: "https://api.example.com/api/v1/",
      fetch: fetcher as typeof globalThis.fetch,
    });

    const response = await auth.session(
      request(
        "/api/auth/session",
        "beaco_access_token=expired; beaco_refresh_token=refresh-token",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "beaco_access_token=new-access-token",
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(fetcher).toHaveBeenCalledWith(
      "http://api:8000/api/v1/auth/refresh",
      expect.objectContaining({
        body: JSON.stringify({ refresh_token: "refresh-token" }),
        method: "POST",
      }),
    );
  });

  it("starts GitHub OAuth at the backend login endpoint", async () => {
    const auth = createNextAuthAdapter({
      backendApiUrl: "http://api:8000/api/v1",
      publicBackendApiUrl: "https://api.example.com/api/v1/",
    });

    const response = await auth.startOAuth("github")(
      request("/api/auth/oauth/github"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://api.example.com/api/v1/oauth/github/login",
    );
  });

  it("exchanges an OAuth code for a cookie-backed Session", async () => {
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith("/auth/oauth/exchange")) {
        return Promise.resolve(
          Response.json({
            access_token: "oauth-access",
            refresh_token: "oauth-refresh",
            token_type: "bearer",
          }),
        );
      }
      return Promise.resolve(Response.json(backendUser));
    });
    const auth = createNextAuthAdapter({
      backendApiUrl: "http://api:8000/api/v1",
      publicBackendApiUrl: "https://api.example.com/api/v1",
      fetch: fetcher as typeof globalThis.fetch,
    });
    const exchangeRequest = new NextRequest(
      "https://app.example.com/api/auth/oauth/exchange",
      {
        method: "POST",
        body: JSON.stringify({ code: "one-time-code" }),
        headers: { "Content-Type": "application/json" },
      },
    );

    const response = await auth.exchangeOAuth(exchangeRequest);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: "user-1" });
    expect(response.headers.get("set-cookie")).toContain(
      "beaco_access_token=oauth-access",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "beaco_refresh_token=oauth-refresh",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "http://api:8000/api/v1/auth/oauth/exchange",
      expect.objectContaining({
        body: JSON.stringify({ code: "one-time-code" }),
        method: "POST",
      }),
    );
  });

  it("forwards a Magic Link request without exposing backend configuration", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(Response.json({ message: "sent" }, { status: 202 })),
    );
    const auth = createNextAuthAdapter({
      backendApiUrl: "http://api:8000/api/v1",
      publicBackendApiUrl: "https://api.example.com/api/v1",
      fetch: fetcher,
    });
    const magicLinkRequest = new NextRequest(
      "https://app.example.com/api/auth/magic-link/request",
      {
        method: "POST",
        body: JSON.stringify({ email: "person@example.com" }),
        headers: { "Content-Type": "application/json" },
      },
    );

    const response = await auth.requestMagicLink(magicLinkRequest);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ message: "sent" });
    expect(fetcher).toHaveBeenCalledWith(
      "http://api:8000/api/v1/auth/magic-link/request",
      expect.objectContaining({
        body: JSON.stringify({ email: "person@example.com" }),
        method: "POST",
      }),
    );
  });

  it("turns a verified Magic Link into a cookie-backed Session", async () => {
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith("/auth/magic-link/verify")) {
        return Promise.resolve(
          Response.json({
            access_token: "magic-access",
            refresh_token: "magic-refresh",
            token_type: "bearer",
          }),
        );
      }
      return Promise.resolve(Response.json(backendUser));
    });
    const auth = createNextAuthAdapter({
      backendApiUrl: "http://api:8000/api/v1",
      publicBackendApiUrl: "https://api.example.com/api/v1",
      fetch: fetcher as typeof globalThis.fetch,
    });
    const verifyRequest = new NextRequest(
      "https://app.example.com/api/auth/magic-link/verify",
      {
        method: "POST",
        body: JSON.stringify({ token: "magic-link-token" }),
        headers: { "Content-Type": "application/json" },
      },
    );

    const response = await auth.verifyMagicLink(verifyRequest);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: "user-1" });
    expect(response.headers.get("set-cookie")).toContain(
      "beaco_access_token=magic-access",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "http://api:8000/api/v1/auth/magic-link/verify",
      expect.objectContaining({
        body: JSON.stringify({ token: "magic-link-token" }),
        method: "POST",
      }),
    );
  });

  it("revokes the refresh credential and clears the browser Session", async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    const auth = createNextAuthAdapter({
      appAuthPath: "/identity",
      backendApiUrl: "http://api:8000/api/v1",
      publicBackendApiUrl: "https://api.example.com/api/v1",
      fetch: fetcher,
    });

    const response = await auth.logout(
      request("/identity/logout", "beaco_refresh_token=refresh-token"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "beaco_access_token=; Path=/; Max-Age=0",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "beaco_refresh_token=; Path=/identity; Max-Age=0",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "http://api:8000/api/v1/auth/logout",
      expect.objectContaining({
        body: JSON.stringify({ refresh_token: "refresh-token" }),
        method: "POST",
      }),
    );
  });
});
