import { describe, expect, it, vi } from "vitest";
import type { ControlPlaneClient } from "../types";
import {
  controlPlaneQueryKeys,
  organizationAnalyticsQuery,
  organizationAuditLogQuery,
  organizationInvitationsQuery,
  organizationMembersQuery,
  organizationsQuery,
  organizationTopEndpointsQuery,
  organizationTrendsQuery,
  organizationUsageHourlyQuery,
  organizationUsageQuery,
  organizationUsageSummaryQuery,
  projectAnalyticsQuery,
  projectApiKeysQuery,
  projectAuditLogQuery,
  projectsQuery,
  projectTopEndpointsQuery,
  projectTrendsQuery,
  projectUsageHourlyQuery,
  projectUsageQuery,
  projectUsageSummaryQuery,
} from "./queries";

const emptyPage = { items: [], total: 0, page: 1, perPage: 20, totalPages: 0 };

describe("control-plane queries", () => {
  it("provides stable organization and project cache boundaries", async () => {
    const client: ControlPlaneClient = {
      organizations: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        archive: vi.fn(),
      },
      members: {
        list: vi.fn().mockResolvedValue([]),
        updateRole: vi.fn(),
        remove: vi.fn(),
      },
      invitations: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        revoke: vi.fn(),
        accept: vi.fn(),
        preview: vi.fn(),
      },
      projects: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        archive: vi.fn(),
      },
      apiKeys: {
        list: vi.fn().mockResolvedValue({
          items: [],
          total: 0,
          page: 1,
          perPage: 20,
          totalPages: 0,
        }),
        create: vi.fn(),
        update: vi.fn(),
        revoke: vi.fn(),
        rotate: vi.fn(),
      },
      auditLog: {
        forProject: vi.fn().mockResolvedValue(emptyPage),
        forOrganization: vi.fn().mockResolvedValue(emptyPage),
      },
      usage: {
        forProject: vi.fn().mockResolvedValue(emptyPage),
        forOrganization: vi.fn().mockResolvedValue(emptyPage),
        summaryForProject: vi.fn(),
        summaryForOrganization: vi.fn(),
        hourlyForProject: vi.fn().mockResolvedValue([]),
        hourlyForOrganization: vi.fn().mockResolvedValue([]),
        topEndpointsForProject: vi.fn().mockResolvedValue([]),
        topEndpointsForOrganization: vi.fn().mockResolvedValue([]),
        analyticsForProject: vi.fn(),
        analyticsForOrganization: vi.fn(),
        trendsForProject: vi.fn(),
        trendsForOrganization: vi.fn(),
      },
    };

    const organizations = organizationsQuery(client);
    const projects = projectsQuery(client, "organization-1");
    const members = organizationMembersQuery(client, "organization-1");
    const invitations = organizationInvitationsQuery(client, "organization-1");

    expect(organizations.queryKey).toEqual(controlPlaneQueryKeys.organizations());
    expect(projects.queryKey).toEqual(controlPlaneQueryKeys.projects("organization-1"));
    expect(members.queryKey).toEqual(controlPlaneQueryKeys.members("organization-1"));
    expect(invitations.queryKey).toEqual(controlPlaneQueryKeys.invitations("organization-1"));
    await organizations.queryFn?.({} as never);
    await projects.queryFn?.({} as never);
    await members.queryFn?.({} as never);
    await invitations.queryFn?.({} as never);
    expect(client.organizations.list).toHaveBeenCalledOnce();
    expect(client.projects.list).toHaveBeenCalledWith("organization-1");
    expect(client.members.list).toHaveBeenCalledWith("organization-1");
    expect(client.invitations.list).toHaveBeenCalledWith("organization-1");
  });

  it("scopes project API key queries by project and page", async () => {
    const client = {
      apiKeys: {
        list: vi.fn().mockResolvedValue({
          items: [],
          total: 0,
          page: 3,
          perPage: 10,
          totalPages: 0,
        }),
        create: vi.fn(),
        update: vi.fn(),
        revoke: vi.fn(),
        rotate: vi.fn(),
      },
    } as unknown as ControlPlaneClient;

    const first = projectApiKeysQuery(client, "project-1", { page: 1, perPage: 20 });
    const filtered = projectApiKeysQuery(client, "project-1", {
      page: 3,
      perPage: 10,
      environment: "live",
      status: "revoked",
    });

    expect(first.queryKey).toEqual([
      ...controlPlaneQueryKeys.projectApiKeys("project-1"),
      1,
      20,
      null,
      null,
    ]);
    expect(filtered.queryKey).toEqual([
      ...controlPlaneQueryKeys.projectApiKeys("project-1"),
      3,
      10,
      "live",
      "revoked",
    ]);
    await filtered.queryFn?.({} as never);
    expect(client.apiKeys.list).toHaveBeenCalledWith("project-1", {
      page: 3,
      perPage: 10,
      environment: "live",
      status: "revoked",
    });
  });

  it("scopes audit-log queries by target, page, and filters", async () => {
    const client = {
      auditLog: {
        forProject: vi.fn().mockResolvedValue(emptyPage),
        forOrganization: vi.fn().mockResolvedValue(emptyPage),
      },
    } as unknown as ControlPlaneClient;

    const project = projectAuditLogQuery(client, "project-1", {});
    const organization = organizationAuditLogQuery(client, "organization-1", {
      page: 2,
      perPage: 50,
      actor: "api_key",
      action: "event",
      category: "operational",
      to: "2026-09-30T00:00:00Z",
    });

    expect(project.queryKey).toEqual([
      ...controlPlaneQueryKeys.projectAuditLog("project-1"),
      1,
      20,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(organization.queryKey).toEqual([
      ...controlPlaneQueryKeys.organizationAuditLog("organization-1"),
      2,
      50,
      "event",
      "api_key",
      "operational",
      null,
      "2026-09-30T00:00:00Z",
    ]);

    for (const options of [project, organization]) {
      expect(options.refetchInterval).toBe(20 * 1000);
      expect(options.refetchOnWindowFocus).toBe(true);
      expect(options.staleTime).toBe(5 * 1000);
    }

    await project.queryFn?.({} as never);
    await organization.queryFn?.({} as never);
    expect(client.auditLog.forProject).toHaveBeenCalledWith("project-1", {
      page: 1,
      perPage: 20,
      action: undefined,
      actor: undefined,
      category: undefined,
      from: undefined,
      to: undefined,
    });
    expect(client.auditLog.forOrganization).toHaveBeenCalledWith("organization-1", {
      page: 2,
      perPage: 50,
      action: "event",
      actor: "api_key",
      category: "operational",
      from: undefined,
      to: "2026-09-30T00:00:00Z",
    });
  });

  it("scopes usage queries by target, page, key, and date range", async () => {
    const summary = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      projectCount: 0,
      apiKeyCount: 0,
      byEnvironment: [],
    };
    const client = {
      usage: {
        forProject: vi.fn().mockResolvedValue(emptyPage),
        forOrganization: vi.fn().mockResolvedValue(emptyPage),
        summaryForProject: vi.fn().mockResolvedValue(summary),
        summaryForOrganization: vi.fn().mockResolvedValue(summary),
      },
    } as unknown as ControlPlaneClient;

    const project = projectUsageQuery(client, "project-1", {});
    const organization = organizationUsageQuery(client, "organization-1", {
      page: 2,
      perPage: 100,
      apiKeyId: "key-1",
      from: "2026-09-01T00:00:00Z",
      to: "2026-09-30T00:00:00Z",
    });
    const projectSummary = projectUsageSummaryQuery(client, "project-1", {});
    const organizationSummary = organizationUsageSummaryQuery(client, "organization-1", {
      apiKeyId: "key-1",
      from: "2026-09-01T00:00:00Z",
    });

    expect(project.queryKey).toEqual([
      ...controlPlaneQueryKeys.projectUsage("project-1"),
      1,
      50,
      null,
      null,
      null,
    ]);
    expect(organization.queryKey).toEqual([
      ...controlPlaneQueryKeys.organizationUsage("organization-1"),
      2,
      100,
      "key-1",
      "2026-09-01T00:00:00Z",
      "2026-09-30T00:00:00Z",
    ]);
    expect(projectSummary.queryKey).toEqual([
      ...controlPlaneQueryKeys.projectUsageSummary("project-1"),
      null,
      null,
      null,
    ]);
    expect(organizationSummary.queryKey).toEqual([
      ...controlPlaneQueryKeys.organizationUsageSummary("organization-1"),
      "key-1",
      "2026-09-01T00:00:00Z",
      null,
    ]);

    for (const options of [project, organization]) {
      expect(options.refetchInterval).toBe(20 * 1000);
      expect(options.refetchOnWindowFocus).toBe(true);
      expect(options.staleTime).toBe(5 * 1000);
    }

    await project.queryFn?.({} as never);
    await organization.queryFn?.({} as never);
    await projectSummary.queryFn?.({} as never);
    await organizationSummary.queryFn?.({} as never);
    expect(client.usage.forProject).toHaveBeenCalledWith("project-1", {
      page: 1,
      perPage: 50,
      apiKeyId: undefined,
      from: undefined,
      to: undefined,
    });
    expect(client.usage.forOrganization).toHaveBeenCalledWith("organization-1", {
      page: 2,
      perPage: 100,
      apiKeyId: "key-1",
      from: "2026-09-01T00:00:00Z",
      to: "2026-09-30T00:00:00Z",
    });
    expect(client.usage.summaryForProject).toHaveBeenCalledWith("project-1", {
      apiKeyId: undefined,
      from: undefined,
      to: undefined,
    });
    expect(client.usage.summaryForOrganization).toHaveBeenCalledWith("organization-1", {
      apiKeyId: "key-1",
      from: "2026-09-01T00:00:00Z",
      to: undefined,
    });
  });

  it("scopes hourly usage and top-endpoints queries by key, date range, and limit", async () => {
    const client = {
      usage: {
        hourlyForProject: vi.fn().mockResolvedValue([]),
        hourlyForOrganization: vi.fn().mockResolvedValue([]),
        topEndpointsForProject: vi.fn().mockResolvedValue([]),
        topEndpointsForOrganization: vi.fn().mockResolvedValue([]),
      },
    } as unknown as ControlPlaneClient;

    const hourly = projectUsageHourlyQuery(client, "project-1", { apiKeyId: "key-1" });
    const orgHourly = organizationUsageHourlyQuery(client, "organization-1", {});
    const top = projectTopEndpointsQuery(client, "project-1", { limit: 3 });
    const orgTop = organizationTopEndpointsQuery(client, "organization-1", {});

    expect(hourly.queryKey).toEqual([
      ...controlPlaneQueryKeys.projectUsageHourly("project-1"),
      "key-1",
      null,
      null,
    ]);
    expect(top.queryKey).toEqual([
      ...controlPlaneQueryKeys.projectTopEndpoints("project-1"),
      null,
      null,
      null,
      3,
    ]);

    await hourly.queryFn?.({} as never);
    await orgHourly.queryFn?.({} as never);
    await top.queryFn?.({} as never);
    await orgTop.queryFn?.({} as never);
    expect(client.usage.hourlyForProject).toHaveBeenCalledWith("project-1", {
      apiKeyId: "key-1",
      from: undefined,
      to: undefined,
    });
    expect(client.usage.topEndpointsForProject).toHaveBeenCalledWith("project-1", {
      apiKeyId: undefined,
      from: undefined,
      to: undefined,
      limit: 3,
    });
  });

  it("scopes analytics and trend queries by key, date range, and granularity", async () => {
    const client = {
      usage: {
        analyticsForProject: vi.fn(),
        analyticsForOrganization: vi.fn(),
        trendsForProject: vi.fn(),
        trendsForOrganization: vi.fn(),
      },
    } as unknown as ControlPlaneClient;

    const analytics = projectAnalyticsQuery(client, "project-1", { apiKeyId: "key-1" });
    const orgAnalytics = organizationAnalyticsQuery(client, "organization-1", {});
    const trends = projectTrendsQuery(client, "project-1", { granularity: "hour" });
    const orgTrends = organizationTrendsQuery(client, "organization-1", {});

    expect(analytics.queryKey).toEqual([
      ...controlPlaneQueryKeys.projectAnalytics("project-1"),
      "key-1",
      null,
      null,
    ]);
    expect(trends.queryKey).toEqual([
      ...controlPlaneQueryKeys.projectTrends("project-1"),
      null,
      null,
      null,
      "hour",
    ]);

    await analytics.queryFn?.({} as never);
    await orgAnalytics.queryFn?.({} as never);
    await trends.queryFn?.({} as never);
    await orgTrends.queryFn?.({} as never);
    expect(client.usage.analyticsForProject).toHaveBeenCalledWith("project-1", {
      apiKeyId: "key-1",
      from: undefined,
      to: undefined,
    });
    expect(client.usage.trendsForProject).toHaveBeenCalledWith("project-1", {
      apiKeyId: undefined,
      from: undefined,
      to: undefined,
      granularity: "hour",
    });
  });
});
