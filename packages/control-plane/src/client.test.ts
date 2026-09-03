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

  it("creates an organization through the application boundary", async () => {
    const fetcher = fetchAdapter(() =>
      Response.json(
        {
          id: "organization-9",
          name: "Fresh Co",
          slug: "fresh-co",
          description: null,
          role: "owner",
          capabilities: ["organization:read", "organization:manage", "project:create"],
          created_at: "2026-09-03T09:00:00Z",
          updated_at: "2026-09-03T09:00:00Z",
          archived_at: null,
        },
        { status: 201 },
      ),
    );
    const client = createControlPlaneClient({ fetch: fetcher });

    await expect(
      client.organizations.create({
        name: "Fresh Co",
        slug: "fresh-co",
        project: { name: "Web", slug: "web" },
      }),
    ).resolves.toEqual({
      id: "organization-9",
      name: "Fresh Co",
      slug: "fresh-co",
      description: null,
      role: "owner",
      capabilities: ["organization:read", "organization:manage", "project:create"],
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/organizations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Fresh Co",
          slug: "fresh-co",
          project: { name: "Web", slug: "web" },
        }),
      }),
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

  it("updates and archives a project through the application boundary", async () => {
    const fetcher = fetchAdapter((input, init) => {
      const project = {
        id: "project-1",
        organization_id: "organization-1",
        name: init?.method === "DELETE" ? "Delivery" : "Renamed",
        slug: "delivery",
        description: init?.method === "DELETE" ? null : "Now with a note",
        created_by_user_id: "user-1",
        created_at: "2026-09-01T09:00:00Z",
        updated_at: "2026-09-03T09:00:00Z",
        archived_at: init?.method === "DELETE" ? "2026-09-03T09:00:00Z" : null,
      };
      return Response.json(project);
    });
    const client = createControlPlaneClient({ fetch: fetcher });

    await expect(
      client.projects.update("project-1", { name: "Renamed", description: "Now with a note" }),
    ).resolves.toMatchObject({ id: "project-1", name: "Renamed", description: "Now with a note" });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/projects/project-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed", description: "Now with a note" }),
      }),
    );

    await expect(client.projects.archive("project-1")).resolves.toMatchObject({ id: "project-1" });
    expect(fetcher).toHaveBeenLastCalledWith(
      "/api/control-plane/projects/project-1",
      expect.objectContaining({ method: "DELETE" }),
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

  it("accepts an invitation by posting the one-time token", async () => {
    const fetcher = fetchAdapter(() => new Response(null, { status: 204 }));
    const client = createControlPlaneClient({ fetch: fetcher });

    await expect(client.invitations.accept("invite-token-123")).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/invitations/accept",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "invite-token-123" }),
      }),
    );
  });

  it("previews an invitation by token as a camel-cased record", async () => {
    const fetcher = fetchAdapter(() =>
      Response.json({
        organization_name: "Northstar",
        role: "admin",
        inviter_name: "Dana",
        expires_at: "2026-09-10T09:00:00Z",
      }),
    );
    const client = createControlPlaneClient({ fetch: fetcher });

    await expect(client.invitations.preview("invite-token-123")).resolves.toEqual({
      organizationName: "Northstar",
      role: "admin",
      inviterName: "Dana",
      expiresAt: "2026-09-10T09:00:00Z",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/invitations/invite-token-123",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("lists project API keys as a camel-cased page", async () => {
    const fetcher = fetchAdapter(() =>
      Response.json({
        items: [
          {
            id: "key-1",
            project_id: "project-1",
            key_prefix: "bea_live_1",
            name: "Ingest",
            description: null,
            environment: "live",
            scopes: ["events:write"],
            is_active: true,
            rate_limit_per_min: 1000,
            created_at: "2026-09-02T09:00:00Z",
            updated_at: "2026-09-02T09:00:00Z",
            last_used_at: null,
            revoked_at: null,
            rotated_from_id: "key-0",
          },
        ],
        total: 1,
        page: 2,
        per_page: 20,
        total_pages: 1,
      }),
    );
    const client = createControlPlaneClient({ fetch: fetcher });

    await expect(
      client.apiKeys.list("project-1", {
        page: 2,
        perPage: 20,
        environment: "live",
        status: "active",
      }),
    ).resolves.toEqual({
      items: [
        {
          id: "key-1",
          projectId: "project-1",
          keyPrefix: "bea_live_1",
          name: "Ingest",
          description: null,
          environment: "live",
          scopes: ["events:write"],
          isActive: true,
          rateLimitPerMin: 1000,
          createdAt: "2026-09-02T09:00:00Z",
          updatedAt: "2026-09-02T09:00:00Z",
          lastUsedAt: null,
          revokedAt: null,
          rotatedFromId: "key-0",
        },
      ],
      total: 1,
      page: 2,
      perPage: 20,
      totalPages: 1,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/projects/project-1/api-keys?page=2&per_page=20&environment=live&status=active",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("creates a project API key and returns the one-time secret", async () => {
    const fetcher = fetchAdapter(() =>
      Response.json(
        {
          id: "key-2",
          project_id: "project-1",
          key_prefix: "bea_test_9",
          name: "CI",
          description: "Continuous integration",
          environment: "test",
          scopes: ["events:read", "events:write"],
          is_active: true,
          rate_limit_per_min: 500,
          created_at: "2026-09-02T09:00:00Z",
          updated_at: "2026-09-02T09:00:00Z",
          last_used_at: null,
          revoked_at: null,
          rotated_from_id: null,
          key: "bea_test_9_secret",
        },
        { status: 201 },
      ),
    );
    const client = createControlPlaneClient({ fetch: fetcher });

    const created = await client.apiKeys.create("project-1", {
      name: "CI",
      description: "Continuous integration",
      scopes: ["events:read", "events:write"],
      rateLimitPerMin: 500,
      environment: "test",
    });

    expect(created).toMatchObject({
      id: "key-2",
      key: "bea_test_9_secret",
      keyPrefix: "bea_test_9",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/projects/project-1/api-keys",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "CI",
          description: "Continuous integration",
          scopes: ["events:read", "events:write"],
          rate_limit_per_min: 500,
          environment: "test",
        }),
      }),
    );
  });

  it("updates only the supplied API key fields and revokes with an empty response", async () => {
    const fetcher = fetchAdapter((input, init) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return Response.json({
        id: "key-1",
        project_id: "project-1",
        key_prefix: "bea_live_1",
        name: "Renamed",
        description: null,
        environment: "live",
        scopes: ["events:read"],
        is_active: true,
        rate_limit_per_min: 1000,
        created_at: "2026-09-02T09:00:00Z",
        updated_at: "2026-09-03T09:00:00Z",
        last_used_at: null,
        revoked_at: null,
        rotated_from_id: null,
      });
    });
    const client = createControlPlaneClient({ fetch: fetcher });

    await client.apiKeys.update("project-1", "key-1", {
      name: "Renamed",
      scopes: ["events:read"],
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/projects/project-1/api-keys/key-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed", scopes: ["events:read"] }),
      }),
    );

    await expect(client.apiKeys.revoke("project-1", "key-1")).resolves.toBeUndefined();
  });

  it("rotates a project API key through the dedicated endpoint", async () => {
    const fetcher = fetchAdapter(() =>
      Response.json({
        id: "key-3",
        project_id: "project-1",
        key_prefix: "bea_live_5",
        name: "Ingest",
        description: null,
        environment: "live",
        scopes: ["events:write"],
        is_active: true,
        rate_limit_per_min: 1000,
        created_at: "2026-09-03T09:00:00Z",
        updated_at: "2026-09-03T09:00:00Z",
        last_used_at: null,
        revoked_at: null,
        rotated_from_id: null,
        key: "bea_live_5_secret",
      }),
    );
    const client = createControlPlaneClient({ fetch: fetcher });

    await expect(client.apiKeys.rotate("project-1", "key-1")).resolves.toMatchObject({
      id: "key-3",
      key: "bea_live_5_secret",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/projects/project-1/api-keys/key-1/rotate",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
