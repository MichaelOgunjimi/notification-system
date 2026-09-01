"use client";

import { useQuery } from "@tanstack/react-query";
import { useControlPlaneClient } from "./provider";
import { organizationsQuery, projectsQuery } from "./queries";

/**
 * Loads organizations available to the authenticated user.
 *
 * @param enabled Whether the query may execute; disable it until auth is resolved.
 * @returns TanStack Query result containing organization records or a structured error.
 */
export function useOrganizations(enabled = true) {
  const client = useControlPlaneClient();
  return useQuery({
    ...organizationsQuery(client),
    enabled,
  });
}

/**
 * Loads projects available within the selected organization.
 *
 * Passing `null` keeps the query disabled and prevents an unscoped request.
 *
 * @param organizationId Organization whose active projects should be loaded.
 * @returns TanStack Query result containing project records or a structured error.
 */
export function useProjects(organizationId: string | null) {
  const client = useControlPlaneClient();
  return useQuery({
    ...projectsQuery(client, organizationId ?? "pending"),
    enabled: Boolean(organizationId),
  });
}
