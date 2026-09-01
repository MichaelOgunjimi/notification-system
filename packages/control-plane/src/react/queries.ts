import { queryOptions } from "@tanstack/react-query";
import { ControlPlaneError } from "../error";
import type { ControlPlaneClient } from "../types";

export const controlPlaneQueryKeys = {
  all: ["control-plane"] as const,
  organizations: () => ["control-plane", "organizations"] as const,
  projects: (organizationId: string) =>
    ["control-plane", "organizations", organizationId, "projects"] as const,
};

const retryTransientFailure = (failureCount: number, error: Error) =>
  error instanceof ControlPlaneError && error.retryable && failureCount < 1;

export function organizationsQuery(client: ControlPlaneClient) {
  return queryOptions({
    queryKey: controlPlaneQueryKeys.organizations(),
    queryFn: () => client.organizations.list(),
    retry: retryTransientFailure,
    staleTime: 30 * 1000,
  });
}

export function projectsQuery(
  client: ControlPlaneClient,
  organizationId: string,
) {
  return queryOptions({
    queryKey: controlPlaneQueryKeys.projects(organizationId),
    queryFn: () => client.projects.list(organizationId),
    retry: retryTransientFailure,
    staleTime: 30 * 1000,
  });
}
