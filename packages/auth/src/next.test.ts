import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createNextAuthAdapter } from "./next";

const backendUser = {
  id: "user-1",
  email: "person@example.com",
  name: "Person",
  avatar_url: "https://images.example.com/avatar.png",
  is_active: true,
  email_verified_at: "2026-08-31T10:00:00Z",
  created_at: "2026-08-31T09:00:00Z",
};

const backendConnection = {
  provider: "github",
  provider_email: "person@github.example.com",
  provider_name: "Person",
  provider_username: "person",
  avatar_url: "https://avatars.example/person",
  created_at: "2026-09-01T10:00:00Z",
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
      avatarUrl: "https://images.example.com/avatar.png",
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
      request("/api/auth/session", "beaco_access_token=expired; beaco_refresh_token=refresh-token"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("beaco_access_token=new-access-token");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(fetcher).toHaveBeenCalledWith(
      "http://api:8000/api/v1/auth/refresh",
      expect.objectContaining({
        body: JSON.stringify({ refresh_token: "refresh-token" }),
        method: "POST",
      }),
    );
  });

  it("preserves session cookies when backend recovery is temporarily unavailable", async () => {
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith("/auth/refresh")) {
        return Promise.resolve(Response.json({ detail: "Unavailable" }, { status: 503 }));
      }
      return Promise.resolve(Response.json({ detail: "Expired" }, { status: 401 }));
    });
    const auth = createNextAuthAdapter({
      backendApiUrl: "http://api:8000/api/v1",
      publicBackendApiUrl: "https://api.example.com/api/v1",
      fetch: fetcher as typeof globalThis.fetch,
    });

    const response = await auth.session(
      request("/api/auth/session", "beaco_access_token=expired; beaco_refresh_token=still-valid"),
    );

    expect(response.status).toBe(502);
    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      detail: "The session service is temporarily unavailable.",
    });
  });

  it("starts GitHub OAuth at the backend login endpoint", async () => {
    const auth = createNextAuthAdapter({
      backendApiUrl: "http://api:8000/api/v1",
      publicBackendApiUrl: "https://api.example.com/api/v1/",
    });

    const response = await auth.startOAuth("github")(request("/api/auth/oauth/github"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://api.example.com/api/v1/oauth/github/login",
    );
  });

  it("starts authenticated GitHub connection and preserves the provider redirect", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        new Response(null, {
          status: 307,
          headers: { Location: "https://github.com/login/oauth/authorize?state=secure" },
        }),
      ),
    );
    const auth = createNextAuthAdapter({
      backendApiUrl: "http://api:8000/api/v1",
      publicBackendApiUrl: "https://api.example.com/api/v1",
      fetch: fetcher,
    });

    const response = await auth.startOAuthConnection("github")(
      request("/api/auth/oauth/github/connect", "beaco_access_token=access-token"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://github.com/login/oauth/authorize?state=secure",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "http://api:8000/api/v1/oauth/github/connect",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
        redirect: "manual",
      }),
    );
  });

  it("normalizes and disconnects authenticated OAuth connections", async () => {
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "DELETE"
        ? Promise.resolve(new Response(null, { status: 204 }))
        : Promise.resolve(Response.json([backendConnection])),
    );
    const auth = createNextAuthAdapter({
      backendApiUrl: "http://api:8000/api/v1",
      publicBackendApiUrl: "https://api.example.com/api/v1",
      fetch: fetcher as typeof globalThis.fetch,
    });

    const connectionsResponse = await auth.connections(
      request("/api/auth/connections", "beaco_access_token=access-token"),
    );
    const disconnectRequest = new NextRequest(
      "https://app.example.com/api/auth/connections/github",
      { method: "DELETE", headers: { cookie: "beaco_access_token=access-token" } },
    );
    const disconnectResponse = await auth.disconnectOAuth(disconnectRequest, "github");

    await expect(connectionsResponse.json()).resolves.toEqual([
      {
        provider: "github",
        providerEmail: "person@github.example.com",
        providerName: "Person",
        providerUsername: "person",
        avatarUrl: "https://avatars.example/person",
        connectedAt: "2026-09-01T10:00:00Z",
      },
    ]);
    expect(disconnectResponse.status).toBe(204);
    expect(fetcher).toHaveBeenLastCalledWith(
      "http://api:8000/api/v1/auth/me/connections/github",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("forwards an authenticated application request without exposing credentials", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(Response.json([{ id: "organization-1", name: "Northstar" }])),
    );
    const auth = createNextAuthAdapter({
      backendApiUrl: "http://api:8000/api/v1",
      publicBackendApiUrl: "https://api.example.com/api/v1",
      fetch: fetcher,
    });

    const response = await auth.forwardAuthenticated(
      request("/api/control-plane/organizations", "beaco_access_token=access-token"),
      "/organizations",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual([{ id: "organization-1", name: "Northstar" }]);
    expect(fetcher).toHaveBeenCalledWith(
      "http://api:8000/api/v1/organizations",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
        method: "GET",
      }),
    );
  });

  it("updates and normalizes a user profile through the cookie boundary", async () => {
    const fetcher = vi.fn(() => Promise.resolve(Response.json(backendUser)));
    const auth = createNextAuthAdapter({
      backendApiUrl: "http://api:8000/api/v1",
      publicBackendApiUrl: "https://api.example.com/api/v1",
      fetch: fetcher,
    });
    const profileRequest = new NextRequest("https://app.example.com/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({ name: "Person" }),
      headers: {
        "Content-Type": "application/json",
        cookie: "beaco_access_token=access-token",
      },
    });

    const response = await auth.updateProfile(profileRequest);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      name: "Person",
      avatarUrl: "https://images.example.com/avatar.png",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "http://api:8000/api/v1/auth/me",
      expect.objectContaining({
        body: expect.any(ArrayBuffer),
        headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
        method: "PATCH",
      }),
    );
  });

  it("refreshes credentials before retrying an authenticated application request", async () => {
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        return Promise.resolve(
          Response.json({
            access_token: "renewed-access",
            refresh_token: "renewed-refresh",
            token_type: "bearer",
          }),
        );
      }
      if (fetcher.mock.calls.length === 1) {
        return Promise.resolve(Response.json({ detail: "Expired" }, { status: 401 }));
      }
      return Promise.resolve(Response.json([{ id: "organization-1" }]));
    });
    const auth = createNextAuthAdapter({
      backendApiUrl: "http://api:8000/api/v1",
      publicBackendApiUrl: "https://api.example.com/api/v1",
      fetch: fetcher as typeof globalThis.fetch,
    });

    const response = await auth.forwardAuthenticated(
      request(
        "/api/control-plane/organizations",
        "beaco_access_token=expired; beaco_refresh_token=refresh-token",
      ),
      "/organizations",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("beaco_access_token=renewed-access");
    expect(fetcher).toHaveBeenLastCalledWith(
      "http://api:8000/api/v1/organizations",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer renewed-access" }),
      }),
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
    const exchangeRequest = new NextRequest("https://app.example.com/api/auth/oauth/exchange", {
      method: "POST",
      body: JSON.stringify({ code: "one-time-code" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await auth.exchangeOAuth(exchangeRequest);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: "user-1" });
    expect(response.headers.get("set-cookie")).toContain("beaco_access_token=oauth-access");
    expect(response.headers.get("set-cookie")).toContain("beaco_refresh_token=oauth-refresh");
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
    const verifyRequest = new NextRequest("https://app.example.com/api/auth/magic-link/verify", {
      method: "POST",
      body: JSON.stringify({ token: "magic-link-token" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await auth.verifyMagicLink(verifyRequest);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: "user-1" });
    expect(response.headers.get("set-cookie")).toContain("beaco_access_token=magic-access");
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
    expect(response.headers.get("set-cookie")).toContain("beaco_access_token=; Path=/; Max-Age=0");
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
