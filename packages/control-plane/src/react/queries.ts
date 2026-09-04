import { queryOptions } from "@tanstack/react-query";
import { ControlPlaneError } from "../error";
import type {
  AnalyticsFilter,
  AuditLogFilter,
  ControlPlaneClient,
  ProjectApiKeyListOptions,
  TrendsFilter,
  UsageFilter,
  UsageSummaryFilter,
} from "../types";

/** Hierarchical TanStack Query keys for control-plane cache invalidation. */
export const controlPlaneQueryKeys = {
  all: ["control-plane"] as const,
  organizations: () => ["control-plane", "organizations"] as const,
  projects: (organizationId: string) =>
    ["control-plane", "organizations", organizationId, "projects"] as const,
  members: (organizationId: string) =>
    ["control-plane", "organizations", organizationId, "members"] as const,
  invitations: (organizationId: string) =>
    ["control-plane", "organizations", organizationId, "invitations"] as const,
  invitationPreview: (token: string) => ["control-plane", "invitations", "preview", token] as const,
  projectApiKeys: (projectId: string) =>
    ["control-plane", "projects", projectId, "api-keys"] as const,
  projectAuditLog: (projectId: string) =>
    ["control-plane", "projects", projectId, "audit-log"] as const,
  organizationAuditLog: (organizationId: string) =>
    ["control-plane", "organizations", organizationId, "audit-log"] as const,
  projectUsage: (projectId: string) => ["control-plane", "projects", projectId, "usage"] as const,
  organizationUsage: (organizationId: string) =>
    ["control-plane", "organizations", organizationId, "usage"] as const,
  projectUsageSummary: (projectId: string) =>
    ["control-plane", "projects", projectId, "usage", "summary"] as const,
  organizationUsageSummary: (organizationId: string) =>
    ["control-plane", "organizations", organizationId, "usage", "summary"] as const,
  projectUsageHourly: (projectId: string) =>
    ["control-plane", "projects", projectId, "usage", "hourly"] as const,
  organizationUsageHourly: (organizationId: string) =>
    ["control-plane", "organizations", organizationId, "usage", "hourly"] as const,
  projectTopEndpoints: (projectId: string) =>
    ["control-plane", "projects", projectId, "usage", "top-endpoints"] as const,
  organizationTopEndpoints: (organizationId: string) =>
    ["control-plane", "organizations", organizationId, "usage", "top-endpoints"] as const,
  projectAnalytics: (projectId: string) =>
    ["control-plane", "projects", projectId, "analytics"] as const,
  organizationAnalytics: (organizationId: string) =>
    ["control-plane", "organizations", organizationId, "analytics"] as const,
  projectTrends: (projectId: string) =>
    ["control-plane", "projects", projectId, "analytics", "trends"] as const,
  organizationTrends: (organizationId: string) =>
    ["control-plane", "organizations", organizationId, "analytics", "trends"] as const,
};

const retryTransientFailure = (failureCount: number, error: Error) =>
  error instanceof ControlPlaneError && error.retryable && failureCount < 1;

/**
 * Builds query options for organizations visible to the current user.
 *
 * Transient failures retry once; authorization and validation failures surface immediately.
 *
 * @param client Control-plane client used by the query function.
 * @returns TanStack Query options with stable keys and retry behavior.
 */
export function organizationsQuery(client: ControlPlaneClient) {
  return queryOptions({
    queryKey: controlPlaneQueryKeys.organizations(),
    queryFn: () => client.organizations.list(),
    retry: retryTransientFailure,
    staleTime: 30 * 1000,
  });
}

/**
 * Builds query options for projects within one organization.
 *
 * @param client Control-plane client used by the query function.
 * @param organizationId Organization that scopes the project request and cache key.
 * @returns TanStack Query options with stable organization-specific caching.
 */
export function projectsQuery(client: ControlPlaneClient, organizationId: string) {
  return queryOptions({
    queryKey: controlPlaneQueryKeys.projects(organizationId),
    queryFn: () => client.projects.list(organizationId),
    retry: retryTransientFailure,
    staleTime: 30 * 1000,
  });
}

/**
 * Builds query options for active organization memberships.
 *
 * @param client Control-plane client used by the query function.
 * @param organizationId Organization whose memberships should be loaded.
 * @returns TanStack Query options with an organization-scoped cache key.
 */
export function organizationMembersQuery(client: ControlPlaneClient, organizationId: string) {
  return queryOptions({
    queryKey: controlPlaneQueryKeys.members(organizationId),
    queryFn: () => client.members.list(organizationId),
    retry: retryTransientFailure,
    staleTime: 30 * 1000,
  });
}

/**
 * Builds query options for pending organization invitations.
 *
 * @param client Control-plane client used by the query function.
 * @param organizationId Organization whose invitations should be loaded.
 * @returns TanStack Query options with an organization-scoped cache key.
 */
export function organizationInvitationsQuery(client: ControlPlaneClient, organizationId: string) {
  return queryOptions({
    queryKey: controlPlaneQueryKeys.invitations(organizationId),
    queryFn: () => client.invitations.list(organizationId),
    retry: retryTransientFailure,
    staleTime: 30 * 1000,
  });
}

/**
 * Builds query options for an invitation preview resolved from its token.
 *
 * A 404 (unknown, revoked, accepted, or expired token) is not retried; the UI
 * treats it as a dead link.
 *
 * @param client Control-plane client used by the query function.
 * @param token One-time invitation token from the emailed accept link.
 * @returns TanStack Query options keyed by the token.
 */
export function invitationPreviewQuery(client: ControlPlaneClient, token: string) {
  return queryOptions({
    queryKey: controlPlaneQueryKeys.invitationPreview(token),
    queryFn: () => client.invitations.preview(token),
    retry: retryTransientFailure,
    staleTime: 30 * 1000,
  });
}

/**
 * Builds query options for one page of a project's API keys.
 *
 * The page, size, and filters are part of the cache key so navigating pages or
 * changing filters does not discard previously loaded pages;
 * `projectApiKeys(projectId)` remains the invalidation boundary for the list.
 *
 * @param client Control-plane client used by the query function.
 * @param projectId Project whose API keys should be loaded.
 * @param options 1-based page, page size, and optional environment/status filters.
 * @returns TanStack Query options scoped to the project, page, size, and filters.
 */
export function projectApiKeysQuery(
  client: ControlPlaneClient,
  projectId: string,
  options: ProjectApiKeyListOptions,
) {
  const { page = 1, perPage = 20, environment, status } = options;
  return queryOptions({
    queryKey: [
      ...controlPlaneQueryKeys.projectApiKeys(projectId),
      page,
      perPage,
      environment ?? null,
      status ?? null,
    ] as const,
    queryFn: () => client.apiKeys.list(projectId, { page, perPage, environment, status }),
    retry: retryTransientFailure,
    staleTime: 30 * 1000,
  });
}

/**
 * Keeps the tenant observability views (activity log, usage) feeling live
 * without a streaming transport: poll a visible tab every 20s (TanStack pauses
 * this for a hidden tab) and catch up immediately on window focus. `staleTime`
 * is short so those refetches actually hit the network. The real-time
 * operational pages (Events, Delivery) will move to Redis pub/sub → SSE.
 */
const tenantLiveness = {
  refetchInterval: 20 * 1000,
  refetchOnWindowFocus: true,
  staleTime: 5 * 1000,
} as const;

function auditLogKeyParts(filter: AuditLogFilter) {
  const { page = 1, perPage = 20, action, actor, category, from, to } = filter;
  return {
    args: { page, perPage, action, actor, category, from, to },
    key: [
      page,
      perPage,
      action ?? null,
      actor ?? null,
      category ?? null,
      from ?? null,
      to ?? null,
    ] as const,
  };
}

/**
 * Builds query options for one page of a project's activity log.
 *
 * Page and filters are part of the cache key so paging or filtering keeps
 * earlier pages; `projectAuditLog(projectId)` is the invalidation boundary.
 *
 * @param client Control-plane client used by the query function.
 * @param projectId Project whose activity should be loaded.
 * @param filter 1-based page, page size, and optional action/actor/from filters.
 * @returns TanStack Query options scoped to the project, page, and filters.
 */
export function projectAuditLogQuery(
  client: ControlPlaneClient,
  projectId: string,
  filter: AuditLogFilter,
) {
  const { args, key } = auditLogKeyParts(filter);
  return queryOptions({
    queryKey: [...controlPlaneQueryKeys.projectAuditLog(projectId), ...key] as const,
    queryFn: () => client.auditLog.forProject(projectId, args),
    retry: retryTransientFailure,
    ...tenantLiveness,
  });
}

/**
 * Builds query options for one page of an organization-wide activity log.
 *
 * @param client Control-plane client used by the query function.
 * @param organizationId Organization whose activity (across all projects) should load.
 * @param filter 1-based page, page size, and optional action/actor/from filters.
 * @returns TanStack Query options scoped to the organization, page, and filters.
 */
export function organizationAuditLogQuery(
  client: ControlPlaneClient,
  organizationId: string,
  filter: AuditLogFilter,
) {
  const { args, key } = auditLogKeyParts(filter);
  return queryOptions({
    queryKey: [...controlPlaneQueryKeys.organizationAuditLog(organizationId), ...key] as const,
    queryFn: () => client.auditLog.forOrganization(organizationId, args),
    retry: retryTransientFailure,
    ...tenantLiveness,
  });
}

function usageKeyParts(filter: UsageFilter) {
  const { page = 1, perPage = 50, apiKeyId, from, to } = filter;
  return {
    args: { page, perPage, apiKeyId, from, to },
    key: [page, perPage, apiKeyId ?? null, from ?? null, to ?? null] as const,
  };
}

/**
 * Builds query options for one page of a project's hourly usage buckets.
 *
 * Page and filters are part of the cache key so paging or filtering keeps
 * earlier pages; `projectUsage(projectId)` is the invalidation boundary.
 *
 * @param client Control-plane client used by the query function.
 * @param projectId Project whose usage should be loaded.
 * @param filter 1-based page, page size, and optional date range.
 * @returns TanStack Query options scoped to the project, page, and filters.
 */
export function projectUsageQuery(
  client: ControlPlaneClient,
  projectId: string,
  filter: UsageFilter,
) {
  const { args, key } = usageKeyParts(filter);
  return queryOptions({
    queryKey: [...controlPlaneQueryKeys.projectUsage(projectId), ...key] as const,
    queryFn: () => client.usage.forProject(projectId, args),
    retry: retryTransientFailure,
    ...tenantLiveness,
  });
}

/**
 * Builds query options for one page of an organization-wide usage list.
 *
 * @param client Control-plane client used by the query function.
 * @param organizationId Organization whose usage (across all projects) should load.
 * @param filter 1-based page, page size, and optional date range.
 * @returns TanStack Query options scoped to the organization, page, and filters.
 */
export function organizationUsageQuery(
  client: ControlPlaneClient,
  organizationId: string,
  filter: UsageFilter,
) {
  const { args, key } = usageKeyParts(filter);
  return queryOptions({
    queryKey: [...controlPlaneQueryKeys.organizationUsage(organizationId), ...key] as const,
    queryFn: () => client.usage.forOrganization(organizationId, args),
    retry: retryTransientFailure,
    ...tenantLiveness,
  });
}

/**
 * Builds query options for a project's usage summary over a date range.
 *
 * @param client Control-plane client used by the query function.
 * @param projectId Project whose usage should be aggregated.
 * @param filter Optional date range; unbounded when omitted.
 * @returns TanStack Query options scoped to the project and date range.
 */
export function projectUsageSummaryQuery(
  client: ControlPlaneClient,
  projectId: string,
  filter: UsageSummaryFilter,
) {
  const { apiKeyId, from, to } = filter;
  return queryOptions({
    queryKey: [
      ...controlPlaneQueryKeys.projectUsageSummary(projectId),
      apiKeyId ?? null,
      from ?? null,
      to ?? null,
    ] as const,
    queryFn: () => client.usage.summaryForProject(projectId, { apiKeyId, from, to }),
    retry: retryTransientFailure,
    ...tenantLiveness,
  });
}

/**
 * Builds query options for an organization's usage summary over a date range.
 *
 * @param client Control-plane client used by the query function.
 * @param organizationId Organization whose usage should be aggregated.
 * @param filter Optional date range; unbounded when omitted.
 * @returns TanStack Query options scoped to the organization and date range.
 */
export function organizationUsageSummaryQuery(
  client: ControlPlaneClient,
  organizationId: string,
  filter: UsageSummaryFilter,
) {
  const { apiKeyId, from, to } = filter;
  return queryOptions({
    queryKey: [
      ...controlPlaneQueryKeys.organizationUsageSummary(organizationId),
      apiKeyId ?? null,
      from ?? null,
      to ?? null,
    ] as const,
    queryFn: () => client.usage.summaryForOrganization(organizationId, { apiKeyId, from, to }),
    retry: retryTransientFailure,
    ...tenantLiveness,
  });
}

function usageHourlyKeyParts(filter: UsageFilter) {
  const { apiKeyId, from, to } = filter;
  return {
    args: { apiKeyId, from, to },
    key: [apiKeyId ?? null, from ?? null, to ?? null] as const,
  };
}

/**
 * Builds query options for a project's usage bucketed by hour of day.
 *
 * @param client Control-plane client used by the query function.
 * @param projectId Project whose usage should be bucketed.
 * @param filter Optional key filter and date range; unbounded when omitted.
 * @returns TanStack Query options scoped to the project and filters.
 */
export function projectUsageHourlyQuery(
  client: ControlPlaneClient,
  projectId: string,
  filter: UsageFilter,
) {
  const { args, key } = usageHourlyKeyParts(filter);
  return queryOptions({
    queryKey: [...controlPlaneQueryKeys.projectUsageHourly(projectId), ...key] as const,
    queryFn: () => client.usage.hourlyForProject(projectId, args),
    retry: retryTransientFailure,
    ...tenantLiveness,
  });
}

/**
 * Builds query options for an organization's usage bucketed by hour of day.
 *
 * @param client Control-plane client used by the query function.
 * @param organizationId Organization whose usage should be bucketed.
 * @param filter Optional key filter and date range; unbounded when omitted.
 * @returns TanStack Query options scoped to the organization and filters.
 */
export function organizationUsageHourlyQuery(
  client: ControlPlaneClient,
  organizationId: string,
  filter: UsageFilter,
) {
  const { args, key } = usageHourlyKeyParts(filter);
  return queryOptions({
    queryKey: [...controlPlaneQueryKeys.organizationUsageHourly(organizationId), ...key] as const,
    queryFn: () => client.usage.hourlyForOrganization(organizationId, args),
    retry: retryTransientFailure,
    ...tenantLiveness,
  });
}

function topEndpointsKeyParts(filter: UsageFilter & Readonly<{ limit?: number }>) {
  const { apiKeyId, from, to, limit } = filter;
  return {
    args: { apiKeyId, from, to, limit },
    key: [apiKeyId ?? null, from ?? null, to ?? null, limit ?? null] as const,
  };
}

/**
 * Builds query options for a project's top endpoints by request count.
 *
 * @param client Control-plane client used by the query function.
 * @param projectId Project whose endpoints should be ranked.
 * @param filter Optional key filter, date range, and result limit.
 * @returns TanStack Query options scoped to the project and filters.
 */
export function projectTopEndpointsQuery(
  client: ControlPlaneClient,
  projectId: string,
  filter: UsageFilter & Readonly<{ limit?: number }>,
) {
  const { args, key } = topEndpointsKeyParts(filter);
  return queryOptions({
    queryKey: [...controlPlaneQueryKeys.projectTopEndpoints(projectId), ...key] as const,
    queryFn: () => client.usage.topEndpointsForProject(projectId, args),
    retry: retryTransientFailure,
    ...tenantLiveness,
  });
}

/**
 * Builds query options for an organization's top endpoints by request count.
 *
 * @param client Control-plane client used by the query function.
 * @param organizationId Organization whose endpoints should be ranked.
 * @param filter Optional key filter, date range, and result limit.
 * @returns TanStack Query options scoped to the organization and filters.
 */
export function organizationTopEndpointsQuery(
  client: ControlPlaneClient,
  organizationId: string,
  filter: UsageFilter & Readonly<{ limit?: number }>,
) {
  const { args, key } = topEndpointsKeyParts(filter);
  return queryOptions({
    queryKey: [...controlPlaneQueryKeys.organizationTopEndpoints(organizationId), ...key] as const,
    queryFn: () => client.usage.topEndpointsForOrganization(organizationId, args),
    retry: retryTransientFailure,
    ...tenantLiveness,
  });
}

function analyticsKeyParts(filter: AnalyticsFilter) {
  const { apiKeyId, from, to } = filter;
  return {
    args: { apiKeyId, from, to },
    key: [apiKeyId ?? null, from ?? null, to ?? null] as const,
  };
}

/**
 * Builds query options for a project's delivery analytics summary.
 *
 * @param client Control-plane client used by the query function.
 * @param projectId Project whose analytics should be aggregated.
 * @param filter Optional key filter and date range (defaults to today).
 * @returns TanStack Query options scoped to the project and filters.
 */
export function projectAnalyticsQuery(
  client: ControlPlaneClient,
  projectId: string,
  filter: AnalyticsFilter,
) {
  const { args, key } = analyticsKeyParts(filter);
  return queryOptions({
    queryKey: [...controlPlaneQueryKeys.projectAnalytics(projectId), ...key] as const,
    queryFn: () => client.usage.analyticsForProject(projectId, args),
    retry: retryTransientFailure,
    ...tenantLiveness,
  });
}

/**
 * Builds query options for an organization's delivery analytics summary.
 *
 * @param client Control-plane client used by the query function.
 * @param organizationId Organization whose analytics should be aggregated.
 * @param filter Optional key filter and date range (defaults to today).
 * @returns TanStack Query options scoped to the organization and filters.
 */
export function organizationAnalyticsQuery(
  client: ControlPlaneClient,
  organizationId: string,
  filter: AnalyticsFilter,
) {
  const { args, key } = analyticsKeyParts(filter);
  return queryOptions({
    queryKey: [...controlPlaneQueryKeys.organizationAnalytics(organizationId), ...key] as const,
    queryFn: () => client.usage.analyticsForOrganization(organizationId, args),
    retry: retryTransientFailure,
    ...tenantLiveness,
  });
}

function trendsKeyParts(filter: TrendsFilter) {
  const { apiKeyId, from, to, granularity } = filter;
  return {
    args: { apiKeyId, from, to, granularity },
    key: [apiKeyId ?? null, from ?? null, to ?? null, granularity ?? null] as const,
  };
}

/**
 * Builds query options for a project's delivery-status trend.
 *
 * @param client Control-plane client used by the query function.
 * @param projectId Project whose trend should be loaded.
 * @param filter Optional key filter, date range, and bucket granularity (defaults to today, by day).
 * @returns TanStack Query options scoped to the project and filters.
 */
export function projectTrendsQuery(
  client: ControlPlaneClient,
  projectId: string,
  filter: TrendsFilter,
) {
  const { args, key } = trendsKeyParts(filter);
  return queryOptions({
    queryKey: [...controlPlaneQueryKeys.projectTrends(projectId), ...key] as const,
    queryFn: () => client.usage.trendsForProject(projectId, args),
    retry: retryTransientFailure,
    ...tenantLiveness,
  });
}

/**
 * Builds query options for an organization's delivery-status trend.
 *
 * @param client Control-plane client used by the query function.
 * @param organizationId Organization whose trend should be loaded.
 * @param filter Optional key filter, date range, and bucket granularity (defaults to today, by day).
 * @returns TanStack Query options scoped to the organization and filters.
 */
export function organizationTrendsQuery(
  client: ControlPlaneClient,
  organizationId: string,
  filter: TrendsFilter,
) {
  const { args, key } = trendsKeyParts(filter);
  return queryOptions({
    queryKey: [...controlPlaneQueryKeys.organizationTrends(organizationId), ...key] as const,
    queryFn: () => client.usage.trendsForOrganization(organizationId, args),
    retry: retryTransientFailure,
    ...tenantLiveness,
  });
}
