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
        email: "leo@example.com",
        role: "admin",
        inviter_name: "Dana",
        expires_at: "2026-09-10T09:00:00Z",
      }),
    );
    const client = createControlPlaneClient({ fetch: fetcher });

    await expect(client.invitations.preview("invite-token-123")).resolves.toEqual({
      organizationName: "Northstar",
      email: "leo@example.com",
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

  it("lists an audit log page with camel-cased entries and forwarded filters", async () => {
    const fetcher = fetchAdapter(() =>
      Response.json({
        items: [
          {
            id: "entry-1",
            organization_id: "organization-1",
            project_id: "project-1",
            actor_user_id: "user-1",
            actor_name: "Ada Owner",
            actor_role: "admin",
            api_key_id: null,
            api_key_name: null,
            api_key_environment: null,
            action: "organization.member_removed",
            resource_type: "organization_membership",
            resource_id: "membership-9",
            metadata: { role: "member" },
            ip_address: "203.0.113.5",
            created_at: "2026-09-04T10:00:00Z",
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
      client.auditLog.forOrganization("organization-1", {
        page: 2,
        perPage: 20,
        actor: "user",
        category: "governance",
        from: "2026-09-01T00:00:00Z",
        to: "2026-09-30T00:00:00Z",
      }),
    ).resolves.toEqual({
      items: [
        {
          id: "entry-1",
          organizationId: "organization-1",
          projectId: "project-1",
          actorUserId: "user-1",
          actorName: "Ada Owner",
          actorRole: "admin",
          apiKeyId: null,
          apiKeyName: null,
          apiKeyEnvironment: null,
          action: "organization.member_removed",
          resourceType: "organization_membership",
          resourceId: "membership-9",
          metadata: { role: "member" },
          ipAddress: "203.0.113.5",
          createdAt: "2026-09-04T10:00:00Z",
        },
      ],
      total: 1,
      page: 2,
      perPage: 20,
      totalPages: 1,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/organizations/organization-1/audit-log?page=2&per_page=20&actor=user&category=governance&from=2026-09-01T00%3A00%3A00Z&to=2026-09-30T00%3A00%3A00Z",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("lists a project's usage page with camel-cased entries and forwarded filters", async () => {
    const fetcher = fetchAdapter(() =>
      Response.json({
        items: [
          {
            project_id: "project-1",
            api_key_id: "key-1",
            api_key_name: "Production key",
            api_key_environment: "live",
            endpoint: "/api/v1/events",
            hour_bucket: "2026-09-04T14:00:00Z",
            request_count: 42,
          },
        ],
        total: 1,
        page: 1,
        per_page: 50,
        total_pages: 1,
      }),
    );
    const client = createControlPlaneClient({ fetch: fetcher });

    await expect(
      client.usage.forProject("project-1", {
        from: "2026-09-01T00:00:00Z",
        to: "2026-09-30T00:00:00Z",
      }),
    ).resolves.toEqual({
      items: [
        {
          projectId: "project-1",
          apiKeyId: "key-1",
          apiKeyName: "Production key",
          apiKeyEnvironment: "live",
          endpoint: "/api/v1/events",
          hourBucket: "2026-09-04T14:00:00Z",
          requestCount: 42,
        },
      ],
      total: 1,
      page: 1,
      perPage: 50,
      totalPages: 1,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/projects/project-1/usage?from=2026-09-01T00%3A00%3A00Z&to=2026-09-30T00%3A00%3A00Z",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("summarizes an organization's usage with camel-cased totals and environment breakdown", async () => {
    const fetcher = fetchAdapter(() =>
      Response.json({
        total_requests: 100,
        successful_requests: 90,
        failed_requests: 10,
        project_count: 2,
        api_key_count: 3,
        by_environment: [
          {
            environment: "live",
            total_requests: 80,
            successful_requests: 75,
            failed_requests: 5,
          },
        ],
      }),
    );
    const client = createControlPlaneClient({ fetch: fetcher });

    await expect(
      client.usage.summaryForOrganization("organization-1", { from: "2026-09-01T00:00:00Z" }),
    ).resolves.toEqual({
      totalRequests: 100,
      successfulRequests: 90,
      failedRequests: 10,
      projectCount: 2,
      apiKeyCount: 3,
      byEnvironment: [
        {
          environment: "live",
          totalRequests: 80,
          successfulRequests: 75,
          failedRequests: 5,
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/organizations/organization-1/usage/summary?from=2026-09-01T00%3A00%3A00Z",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("buckets a project's usage by hour of day and forwards the key filter", async () => {
    const fetcher = fetchAdapter(() =>
      Response.json(
        Array.from({ length: 24 }, (_, hour) => ({ hour, request_count: hour === 14 ? 42 : 0 })),
      ),
    );
    const client = createControlPlaneClient({ fetch: fetcher });

    const points = await client.usage.hourlyForProject("project-1", { apiKeyId: "key-1" });

    expect(points).toHaveLength(24);
    expect(points[14]).toEqual({ hour: 14, requestCount: 42 });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/projects/project-1/usage/hourly?api_key_id=key-1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("ranks a project's top endpoints with a limit", async () => {
    const fetcher = fetchAdapter(() =>
      Response.json([{ endpoint: "/api/v1/events", request_count: 20 }]),
    );
    const client = createControlPlaneClient({ fetch: fetcher });

    await expect(client.usage.topEndpointsForProject("project-1", { limit: 3 })).resolves.toEqual([
      { endpoint: "/api/v1/events", requestCount: 20 },
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/projects/project-1/usage/top-endpoints?limit=3",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("camel-cases a project's analytics summary and forwards filters", async () => {
    const fetcher = fetchAdapter(() =>
      Response.json({
        events_today: 4,
        events_completed: 3,
        events_failed: 1,
        events_processing: 0,
        notifications_delivered: 5,
        notifications_failed: 1,
        notifications_processing: 0,
        notifications_queued: 0,
        dlq_active: 1,
        success_rate: 83.3,
        avg_delivery_latency_ms: 412.5,
        channel_stats: [{ channel: "email", delivered: 5, failed: 1, pending: 0, dead_letter: 0 }],
      }),
    );
    const client = createControlPlaneClient({ fetch: fetcher });

    await expect(
      client.usage.analyticsForProject("project-1", { apiKeyId: "key-1" }),
    ).resolves.toEqual({
      eventsToday: 4,
      eventsCompleted: 3,
      eventsFailed: 1,
      eventsProcessing: 0,
      notificationsDelivered: 5,
      notificationsFailed: 1,
      notificationsProcessing: 0,
      notificationsQueued: 0,
      dlqActive: 1,
      successRate: 83.3,
      avgDeliveryLatencyMs: 412.5,
      channelStats: [{ channel: "email", delivered: 5, failed: 1, pending: 0, deadLetter: 0 }],
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/projects/project-1/analytics?api_key_id=key-1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("camel-cases a project's delivery trend and forwards granularity", async () => {
    const fetcher = fetchAdapter(() =>
      Response.json({
        points: [
          { timestamp: "2026-09-04T00:00:00", delivered: 5, failed: 1, queued: 0, processing: 0 },
        ],
      }),
    );
    const client = createControlPlaneClient({ fetch: fetcher });

    await expect(
      client.usage.trendsForProject("project-1", { granularity: "hour" }),
    ).resolves.toEqual({
      points: [
        { timestamp: "2026-09-04T00:00:00", delivered: 5, failed: 1, queued: 0, processing: 0 },
      ],
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/control-plane/projects/project-1/analytics/trends?granularity=hour",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
