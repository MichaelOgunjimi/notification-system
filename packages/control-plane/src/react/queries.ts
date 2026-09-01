import { queryOptions } from "@tanstack/react-query";
import { ControlPlaneError } from "../error";
import type { ControlPlaneClient } from "../types";

/** Hierarchical TanStack Query keys for control-plane cache invalidation. */
export const controlPlaneQueryKeys = {
  all: ["control-plane"] as const,
  organizations: () => ["control-plane", "organizations"] as const,
  projects: (organizationId: string) =>
    ["control-plane", "organizations", organizationId, "projects"] as const,
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
