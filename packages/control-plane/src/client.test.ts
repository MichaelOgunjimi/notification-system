import { describe, expect, it, vi } from "vitest";
import { createControlPlaneClient } from "./client";
import { ControlPlaneError } from "./error";

function fetchAdapter(handler: (input: RequestInfo | URL, init?: RequestInit) => Response) {
  return vi.fn(handler) as unknown as typeof globalThis.fetch;
}

describe("createControlPlaneClient", () => {
  it("lists organizations through the configured application boundary", async () => {
    const fetcher = fetchAdapter(() =>
      Response.json([
        {
          id: "organization-1",
          name: "Northstar",
          slug: "northstar",
          description: "Primary organization",
          role: "owner",
          capabilities: ["organization:read", "project:create"],
          created_at: "2026-09-01T09:00:00Z",
          updated_at: "2026-09-01T09:00:00Z",
          archived_at: null,
        },
      ]),
    );
    const client = createControlPlaneClient({
      appControlPlanePath: "/workspace-api/",
      fetch: fetcher,
    });

    await expect(client.organizations.list()).resolves.toEqual([
      {
        id: "organization-1",
        name: "Northstar",
        slug: "northstar",
        description: "Primary organization",
        role: "owner",
        capabilities: ["organization:read", "project:create"],
      },
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      "/workspace-api/organizations",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
        method: "GET",
      }),
    );
  });

  it("exposes backend failures as structured retry-aware errors", async () => {
    const client = createControlPlaneClient({
      fetch: fetchAdapter(() =>
        Response.json({ detail: "Organization access was revoked." }, { status: 403 }),
      ),
    });

    const error = await client.organizations.list().catch((reason) => reason);

    expect(error).toBeInstanceOf(ControlPlaneError);
    expect(error).toMatchObject({
      code: "forbidden",
      message: "Organization access was revoked.",
      retryable: false,
      status: 403,
    });
  });

  it("lists projects with application-facing field names", async () => {
    const fetcher = fetchAdapter(() =>
      Response.json([
        {
          id: "project-1",
          organization_id: "organization-1",
          name: "Delivery",
          slug: "delivery",
          description: null,
          created_by_user_id: "user-1",
          created_at: "2026-09-01T09:00:00Z",
          updated_at: "2026-09-01T09:00:00Z",
          archived_at: null,
        },
      ]),
    );
    const client = createControlPlaneClient({ fetch: fetcher });

    await expect(client.projects.list("organization-1")).resolves.toEqual([
      {
        id: "project-1",
        organizationId: "organization-1",
        name: "Delivery",
        slug: "delivery",
        description: null,
      },
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/organizations/organization-1/projects",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("forwards organization updates as JSON through the application boundary", async () => {
    const fetcher = fetchAdapter(() =>
      Response.json({
        id: "organization-1",
        name: "Northstar Labs",
        slug: "northstar-labs",
        description: null,
        role: "owner",
        capabilities: ["organization:read", "organization:manage"],
        created_at: "2026-09-01T09:00:00Z",
        updated_at: "2026-09-02T09:00:00Z",
        archived_at: null,
      }),
    );
    const client = createControlPlaneClient({ fetch: fetcher });

    await client.organizations.update("organization-1", {
      name: "Northstar Labs",
      slug: "northstar-labs",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/organizations/organization-1",
      expect.objectContaining({
        body: JSON.stringify({ name: "Northstar Labs", slug: "northstar-labs" }),
        method: "PATCH",
      }),
    );
  });

  it("maps member and invitation records and handles empty delete responses", async () => {
    const fetcher = fetchAdapter((input, init) => {
      const path = String(input);
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (path.endsWith("/members")) {
        return Response.json([
          {
            id: "membership-1",
            user_id: "user-1",
            email: "maya@example.com",
            name: "Maya",
            role: "admin",
            joined_at: "2026-09-01T09:00:00Z",
          },
        ]);
      }
      return Response.json([
        {
          id: "invitation-1",
          organization_id: "organization-1",
          email: "leo@example.com",
          role: "member",
          invited_by_user_id: "user-1",
          expires_at: "2026-09-09T09:00:00Z",
          accepted_at: null,
          revoked_at: null,
          created_at: "2026-09-02T09:00:00Z",
        },
      ]);
    });
    const client = createControlPlaneClient({ fetch: fetcher });

    await expect(client.members.list("organization-1")).resolves.toEqual([
      {
        id: "membership-1",
        userId: "user-1",
        email: "maya@example.com",
        name: "Maya",
        role: "admin",
        joinedAt: "2026-09-01T09:00:00Z",
      },
    ]);
    await expect(client.invitations.list("organization-1")).resolves.toEqual([
      expect.objectContaining({
        id: "invitation-1",
        organizationId: "organization-1",
        acceptedAt: null,
        revokedAt: null,
      }),
    ]);
    await expect(client.members.remove("organization-1", "membership-1")).resolves.toBeUndefined();
  });
});
