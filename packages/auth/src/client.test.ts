import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "./client";
import { AuthError } from "./error";

const user = {
  id: "user-1",
  email: "person@example.com",
  name: "Person",
  avatarUrl: null,
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

  it("forwards a return path when requesting a magic link", async () => {
    const fetcher = fetchAdapter(() => Response.json({ message: "sent" }, { status: 202 }));
    const client = createAuthClient({ appAuthPath: "/identity", fetch: fetcher });

    await client.sendMagicLink({
      email: "person@example.com",
      next: "/invitations/accept?token=abc",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/identity/magic-link/request",
      expect.objectContaining({
        body: JSON.stringify({
          email: "person@example.com",
          next: "/invitations/accept?token=abc",
        }),
      }),
    );
  });

  it("manages email addresses through the app auth route", async () => {
    const emailRecord = {
      id: "email-1",
      email: "second@example.com",
      isPrimary: false,
      verifiedAt: null,
      createdAt: "2026-09-03T09:00:00Z",
    };
    const fetcher = fetchAdapter((_input, init) =>
      init?.method === "DELETE" || String(_input).endsWith("/resend")
        ? new Response(null, { status: 204 })
        : Response.json(
            String(_input).endsWith("/emails") && init?.method === "GET"
              ? [emailRecord]
              : emailRecord,
          ),
    );
    const client = createAuthClient({ appAuthPath: "/api/auth", fetch: fetcher });

    await expect(client.listEmailAddresses()).resolves.toEqual([emailRecord]);
    await client.addEmailAddress("  Second@Example.com ");
    expect(fetcher).toHaveBeenLastCalledWith(
      "/api/auth/me/emails",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "second@example.com" }),
      }),
    );
    await expect(client.setPrimaryEmailAddress("email-1")).resolves.toEqual(emailRecord);
    await expect(client.resendEmailVerification("email-1")).resolves.toBeUndefined();
    await expect(client.removeEmailAddress("email-1")).resolves.toBeUndefined();
    await expect(client.verifyEmailAddress("verify-token")).resolves.toEqual(emailRecord);
    expect(fetcher).toHaveBeenLastCalledWith(
      "/api/auth/emails/verify",
      expect.objectContaining({ body: JSON.stringify({ token: "verify-token" }) }),
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

  it("updates profile fields through the same-origin auth boundary", async () => {
    const updatedUser = {
      ...user,
      name: "Updated Person",
      avatarUrl: "https://images.example.com/avatar.png",
    };
    const fetcher = fetchAdapter(() => Response.json(updatedUser));
    const client = createAuthClient({ fetch: fetcher });

    await expect(
      client.updateProfile({
        name: "  Updated Person  ",
        avatarUrl: "https://images.example.com/avatar.png",
      }),
    ).resolves.toEqual(updatedUser);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/profile",
      expect.objectContaining({
        body: JSON.stringify({
          name: "Updated Person",
          avatar_url: "https://images.example.com/avatar.png",
        }),
        method: "PATCH",
      }),
    );
  });

  it("lists and disconnects OAuth connections through the app boundary", async () => {
    const connection = {
      provider: "github" as const,
      providerEmail: "person@github.example",
      providerName: "Person",
      providerUsername: "person",
      avatarUrl: "https://avatars.example/person",
      connectedAt: "2026-09-01T10:00:00Z",
    };
    const fetcher = fetchAdapter((input) =>
      String(input).endsWith("/connections")
        ? Response.json([connection])
        : new Response(null, { status: 204 }),
    );
    const client = createAuthClient({ fetch: fetcher });

    await expect(client.getOAuthConnections()).resolves.toEqual([connection]);
    await expect(client.disconnectOAuth("github")).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/auth/connections",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/auth/connections/github",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(client.getOAuthConnectUrl("github")).toBe("/api/auth/oauth/github/connect");
  });

  it("carries a return path on the OAuth sign-in and connect URLs", () => {
    const client = createAuthClient({ appAuthPath: "/api/auth" });

    expect(client.getOAuthSignInUrl("github", { next: "/invitations/accept?token=abc" })).toBe(
      "/api/auth/oauth/github?next=%2Finvitations%2Faccept%3Ftoken%3Dabc",
    );
    expect(client.getOAuthConnectUrl("github", { next: "/app/acme/web/settings/account" })).toBe(
      "/api/auth/oauth/github/connect?next=%2Fapp%2Facme%2Fweb%2Fsettings%2Faccount",
    );
    expect(client.getOAuthSignInUrl("github")).toBe("/api/auth/oauth/github");
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
