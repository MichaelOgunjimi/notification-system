"use client";

import { useQuery } from "@tanstack/react-query";
import { useControlPlaneClient } from "./provider";
import { organizationsQuery, projectsQuery } from "./queries";

export function useOrganizations(enabled = true) {
  const client = useControlPlaneClient();
  return useQuery({
    ...organizationsQuery(client),
    enabled,
  });
}

export function useProjects(organizationId: string | null) {
  const client = useControlPlaneClient();
  return useQuery({
    ...projectsQuery(client, organizationId ?? "pending"),
    enabled: Boolean(organizationId),
  });
}
