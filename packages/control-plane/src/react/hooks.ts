"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  OrganizationCreate,
  OrganizationInvitationCreate,
  OrganizationRole,
  OrganizationUpdate,
  ProjectApiKeyCreate,
  ProjectApiKeyUpdate,
  ProjectCreate,
} from "../types";
import { useControlPlaneClient } from "./provider";
import {
  controlPlaneQueryKeys,
  organizationInvitationsQuery,
  organizationMembersQuery,
  organizationsQuery,
  projectApiKeysQuery,
  projectsQuery,
} from "./queries";

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

/**
 * Loads active memberships for one organization.
 *
 * @param organizationId Organization whose member roster should be loaded.
 * @returns TanStack Query result; a null identifier keeps the request disabled.
 */
export function useOrganizationMembers(organizationId: string | null) {
  const client = useControlPlaneClient();
  return useQuery({
    ...organizationMembersQuery(client, organizationId ?? "pending"),
    enabled: Boolean(organizationId),
  });
}

/**
 * Loads active invitations for one organization.
 *
 * @param organizationId Organization whose pending invitations should be loaded.
 * @returns TanStack Query result; a null identifier keeps the request disabled.
 */
export function useOrganizationInvitations(organizationId: string | null) {
  const client = useControlPlaneClient();
  return useQuery({
    ...organizationInvitationsQuery(client, organizationId ?? "pending"),
    enabled: Boolean(organizationId),
  });
}

/**
 * Creates an organization (the backend seeds a default project) and refreshes
 * the organization list.
 *
 * @returns TanStack mutation accepting the new organization's name, slug, and description.
 */
export function useCreateOrganization() {
  const client = useControlPlaneClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (organization: OrganizationCreate) => client.organizations.create(organization),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: controlPlaneQueryKeys.organizations() }),
  });
}

/**
 * Updates organization profile fields and refreshes organization caches.
 *
 * @returns TanStack mutation accepting an organization identifier and field changes.
 */
export function useUpdateOrganization() {
  const client = useControlPlaneClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      changes,
    }: {
      organizationId: string;
      changes: OrganizationUpdate;
    }) => client.organizations.update(organizationId, changes),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: controlPlaneQueryKeys.organizations() }),
  });
}

/**
 * Creates an organization invitation and refreshes its invitation roster.
 *
 * @returns TanStack mutation accepting an organization identifier and invitation fields.
 */
export function useInviteOrganizationMember() {
  const client = useControlPlaneClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      invitation,
    }: {
      organizationId: string;
      invitation: OrganizationInvitationCreate;
    }) => client.invitations.create(organizationId, invitation),
    onSuccess: (_invitation, variables) =>
      queryClient.invalidateQueries({
        queryKey: controlPlaneQueryKeys.invitations(variables.organizationId),
      }),
  });
}

/**
 * Changes a membership role and refreshes the organization roster.
 *
 * @returns TanStack mutation accepting organization, membership, and role identifiers.
 */
export function useUpdateOrganizationMemberRole() {
  const client = useControlPlaneClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      membershipId,
      role,
    }: {
      organizationId: string;
      membershipId: string;
      role: OrganizationRole;
    }) => client.members.updateRole(organizationId, membershipId, role),
    onSuccess: (_member, variables) =>
      queryClient.invalidateQueries({
        queryKey: controlPlaneQueryKeys.members(variables.organizationId),
      }),
  });
}

/**
 * Removes an organization membership and refreshes the organization roster.
 *
 * @returns TanStack mutation accepting organization and membership identifiers.
 */
export function useRemoveOrganizationMember() {
  const client = useControlPlaneClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      membershipId,
    }: {
      organizationId: string;
      membershipId: string;
    }) => client.members.remove(organizationId, membershipId),
    onSuccess: (_result, variables) =>
      queryClient.invalidateQueries({
        queryKey: controlPlaneQueryKeys.members(variables.organizationId),
      }),
  });
}

/**
 * Revokes a pending invitation and refreshes the invitation roster.
 *
 * @returns TanStack mutation accepting organization and invitation identifiers.
 */
export function useRevokeOrganizationInvitation() {
  const client = useControlPlaneClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      invitationId,
    }: {
      organizationId: string;
      invitationId: string;
    }) => client.invitations.revoke(organizationId, invitationId),
    onSuccess: (_result, variables) =>
      queryClient.invalidateQueries({
        queryKey: controlPlaneQueryKeys.invitations(variables.organizationId),
      }),
  });
}

/**
 * Creates a project and refreshes the organization's project cache.
 *
 * @returns TanStack mutation accepting an organization identifier and project fields.
 */
export function useCreateProject() {
  const client = useControlPlaneClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, project }: { organizationId: string; project: ProjectCreate }) =>
      client.projects.create(organizationId, project),
    onSuccess: (_project, variables) =>
      queryClient.invalidateQueries({
        queryKey: controlPlaneQueryKeys.projects(variables.organizationId),
      }),
  });
}

/**
 * Loads one page of a project's API keys, keeping the previous page visible
 * while the next page loads.
 *
 * @param projectId Project whose API keys should be loaded; null disables the query.
 * @param page 1-based page number.
 * @param perPage Page size (1-100).
 * @returns TanStack Query result containing a page of API key metadata.
 */
export function useProjectApiKeys(projectId: string | null, page = 1, perPage = 20) {
  const client = useControlPlaneClient();
  return useQuery({
    ...projectApiKeysQuery(client, projectId ?? "pending", page, perPage),
    enabled: Boolean(projectId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Creates a project API key and refreshes the project's API key cache.
 *
 * @returns TanStack mutation accepting a project identifier and key fields;
 * resolves with the one-time plaintext secret.
 */
export function useCreateProjectApiKey() {
  const client = useControlPlaneClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: string; input: ProjectApiKeyCreate }) =>
      client.apiKeys.create(projectId, input),
    onSuccess: (_apiKey, variables) =>
      queryClient.invalidateQueries({
        queryKey: controlPlaneQueryKeys.projectApiKeys(variables.projectId),
      }),
  });
}

/**
 * Updates a project API key's name, description, scopes, or rate limit.
 *
 * @returns TanStack mutation accepting the project and key identifiers and field changes.
 */
export function useUpdateProjectApiKey() {
  const client = useControlPlaneClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      apiKeyId,
      changes,
    }: {
      projectId: string;
      apiKeyId: string;
      changes: ProjectApiKeyUpdate;
    }) => client.apiKeys.update(projectId, apiKeyId, changes),
    onSuccess: (_apiKey, variables) =>
      queryClient.invalidateQueries({
        queryKey: controlPlaneQueryKeys.projectApiKeys(variables.projectId),
      }),
  });
}

/**
 * Revokes a project API key and refreshes the project's API key cache.
 *
 * @returns TanStack mutation accepting the project and key identifiers.
 */
export function useRevokeProjectApiKey() {
  const client = useControlPlaneClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, apiKeyId }: { projectId: string; apiKeyId: string }) =>
      client.apiKeys.revoke(projectId, apiKeyId),
    onSuccess: (_result, variables) =>
      queryClient.invalidateQueries({
        queryKey: controlPlaneQueryKeys.projectApiKeys(variables.projectId),
      }),
  });
}

/**
 * Rotates a project API key and refreshes the project's API key cache.
 *
 * @returns TanStack mutation accepting the project and key identifiers;
 * resolves with the replacement key's one-time plaintext secret.
 */
export function useRotateProjectApiKey() {
  const client = useControlPlaneClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, apiKeyId }: { projectId: string; apiKeyId: string }) =>
      client.apiKeys.rotate(projectId, apiKeyId),
    onSuccess: (_apiKey, variables) =>
      queryClient.invalidateQueries({
        queryKey: controlPlaneQueryKeys.projectApiKeys(variables.projectId),
      }),
  });
}
