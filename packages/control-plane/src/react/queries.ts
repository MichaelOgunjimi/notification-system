import { queryOptions } from "@tanstack/react-query";
import { ControlPlaneError } from "../error";
import type { ControlPlaneClient } from "../types";

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
  projectApiKeys: (projectId: string) =>
    ["control-plane", "projects", projectId, "api-keys"] as const,
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
 * Builds query options for one page of a project's API keys.
 *
 * The page and size are part of the cache key so navigating pages does not
 * discard previously loaded pages; `projectApiKeys(projectId)` remains the
 * invalidation boundary for the whole list.
 *
 * @param client Control-plane client used by the query function.
 * @param projectId Project whose API keys should be loaded.
 * @param page 1-based page number.
 * @param perPage Page size (1-100).
 * @returns TanStack Query options scoped to the project, page, and size.
 */
export function projectApiKeysQuery(
  client: ControlPlaneClient,
  projectId: string,
  page: number,
  perPage: number,
) {
  return queryOptions({
    queryKey: [...controlPlaneQueryKeys.projectApiKeys(projectId), page, perPage] as const,
    queryFn: () => client.apiKeys.list(projectId, { page, perPage }),
    retry: retryTransientFailure,
    staleTime: 30 * 1000,
  });
}
