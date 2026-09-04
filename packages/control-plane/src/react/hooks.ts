"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AnalyticsFilter,
  AuditLogFilter,
  OrganizationCreate,
  OrganizationInvitationCreate,
  OrganizationRole,
  OrganizationUpdate,
  ProjectApiKeyCreate,
  ProjectApiKeyListOptions,
  ProjectApiKeyUpdate,
  ProjectCreate,
  ProjectUpdate,
  TrendsFilter,
  UsageFilter,
  UsageSummaryFilter,
} from "../types";
import { useControlPlaneClient } from "./provider";
import {
  controlPlaneQueryKeys,
  invitationPreviewQuery,
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
 * Archives an organization and refreshes the organization list.
 *
 * @returns TanStack mutation accepting an organization identifier.
 */
export function useArchiveOrganization() {
  const client = useControlPlaneClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId }: { organizationId: string }) =>
      client.organizations.archive(organizationId),
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
 * Loads a description of a pending invitation from its token.
 *
 * @param token One-time invitation token; null or empty keeps the query disabled.
 * @returns TanStack Query result with the organization name, role, and inviter.
 */
export function useInvitationPreview(token: string | null) {
  const client = useControlPlaneClient();
  return useQuery({
    ...invitationPreviewQuery(client, token ?? "pending"),
    enabled: Boolean(token),
  });
}

/**
 * Accepts an organization invitation for the signed-in user and refreshes the
 * organization list so the new membership appears.
 *
 * @returns TanStack mutation accepting the one-time invitation token.
 */
export function useAcceptInvitation() {
  const client = useControlPlaneClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ token }: { token: string }) => client.invitations.accept(token),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: controlPlaneQueryKeys.organizations() }),
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
 * Updates a project's profile and refreshes the organization's project cache.
 *
 * @returns TanStack mutation accepting the organization and project identifiers and field changes.
 */
export function useUpdateProject() {
  const client = useControlPlaneClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      changes,
    }: {
      organizationId: string;
      projectId: string;
      changes: ProjectUpdate;
    }) => client.projects.update(projectId, changes),
    onSuccess: (_project, variables) =>
      queryClient.invalidateQueries({
        queryKey: controlPlaneQueryKeys.projects(variables.organizationId),
      }),
  });
}

/**
 * Archives a project and refreshes the organization's project cache.
 *
 * @returns TanStack mutation accepting the organization and project identifiers.
 */
export function useArchiveProject() {
  const client = useControlPlaneClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId }: { organizationId: string; projectId: string }) =>
      client.projects.archive(projectId),
    onSuccess: (_project, variables) =>
      queryClient.invalidateQueries({
        queryKey: controlPlaneQueryKeys.projects(variables.organizationId),
      }),
  });
}

/**
 * Loads one page of a project's API keys, keeping the previous page visible
 * while the next page or filter loads.
 *
 * @param projectId Project whose API keys should be loaded; null disables the query.
 * @param options 1-based page, page size, and optional environment/status filters.
 * @returns TanStack Query result containing a page of API key metadata.
 */
export function useProjectApiKeys(
  projectId: string | null,
  options: ProjectApiKeyListOptions = {},
) {
  const client = useControlPlaneClient();
  return useQuery({
    ...projectApiKeysQuery(client, projectId ?? "pending", options),
    enabled: Boolean(projectId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Loads one page of a project's activity log.
 *
 * @param projectId Project whose activity should be loaded; null disables the query.
 * @param filter 1-based page, page size, and optional action/actor/from filters.
 * @returns TanStack Query result containing a page of audit entries.
 */
export function useProjectAuditLog(projectId: string | null, filter: AuditLogFilter = {}) {
  const client = useControlPlaneClient();
  return useQuery({
    ...projectAuditLogQuery(client, projectId ?? "pending", filter),
    enabled: Boolean(projectId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Loads one page of an organization-wide activity log (all projects).
 *
 * @param organizationId Organization whose activity should be loaded; null disables the query.
 * @param filter 1-based page, page size, and optional action/actor/from filters.
 * @returns TanStack Query result containing a page of audit entries.
 */
export function useOrganizationAuditLog(
  organizationId: string | null,
  filter: AuditLogFilter = {},
) {
  const client = useControlPlaneClient();
  return useQuery({
    ...organizationAuditLogQuery(client, organizationId ?? "pending", filter),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Loads one page of a project's hourly API usage.
 *
 * @param projectId Project whose usage should be loaded; null disables the query.
 * @param filter 1-based page, page size, and optional date range.
 * @returns TanStack Query result containing a page of usage rows.
 */
export function useProjectUsage(projectId: string | null, filter: UsageFilter = {}) {
  const client = useControlPlaneClient();
  return useQuery({
    ...projectUsageQuery(client, projectId ?? "pending", filter),
    enabled: Boolean(projectId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Loads one page of an organization-wide API usage list (all projects).
 *
 * @param organizationId Organization whose usage should be loaded; null disables the query.
 * @param filter 1-based page, page size, and optional date range.
 * @returns TanStack Query result containing a page of usage rows.
 */
export function useOrganizationUsage(organizationId: string | null, filter: UsageFilter = {}) {
  const client = useControlPlaneClient();
  return useQuery({
    ...organizationUsageQuery(client, organizationId ?? "pending", filter),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Loads a project's usage summary (totals and environment breakdown) over a date range.
 *
 * @param projectId Project whose usage should be aggregated; null disables the query.
 * @param filter Optional date range; unbounded when omitted.
 * @returns TanStack Query result containing the usage summary.
 */
export function useProjectUsageSummary(projectId: string | null, filter: UsageSummaryFilter = {}) {
  const client = useControlPlaneClient();
  return useQuery({
    ...projectUsageSummaryQuery(client, projectId ?? "pending", filter),
    enabled: Boolean(projectId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Loads an organization's usage summary (totals and environment breakdown) over a date range.
 *
 * @param organizationId Organization whose usage should be aggregated; null disables the query.
 * @param filter Optional date range; unbounded when omitted.
 * @returns TanStack Query result containing the usage summary.
 */
export function useOrganizationUsageSummary(
  organizationId: string | null,
  filter: UsageSummaryFilter = {},
) {
  const client = useControlPlaneClient();
  return useQuery({
    ...organizationUsageSummaryQuery(client, organizationId ?? "pending", filter),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Loads a project's usage bucketed by hour of day (0-23, UTC).
 *
 * @param projectId Project whose usage should be bucketed; null disables the query.
 * @param filter Optional key filter and date range; unbounded when omitted.
 * @returns TanStack Query result containing all 24 hours, zero-filled.
 */
export function useProjectUsageHourly(projectId: string | null, filter: UsageFilter = {}) {
  const client = useControlPlaneClient();
  return useQuery({
    ...projectUsageHourlyQuery(client, projectId ?? "pending", filter),
    enabled: Boolean(projectId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Loads an organization's usage bucketed by hour of day (0-23, UTC).
 *
 * @param organizationId Organization whose usage should be bucketed; null disables the query.
 * @param filter Optional key filter and date range; unbounded when omitted.
 * @returns TanStack Query result containing all 24 hours, zero-filled.
 */
export function useOrganizationUsageHourly(
  organizationId: string | null,
  filter: UsageFilter = {},
) {
  const client = useControlPlaneClient();
  return useQuery({
    ...organizationUsageHourlyQuery(client, organizationId ?? "pending", filter),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Loads a project's top endpoints by request count.
 *
 * @param projectId Project whose endpoints should be ranked; null disables the query.
 * @param filter Optional key filter, date range, and result limit.
 * @returns TanStack Query result containing endpoints sorted by request count, descending.
 */
export function useProjectTopEndpoints(
  projectId: string | null,
  filter: UsageFilter & Readonly<{ limit?: number }> = {},
) {
  const client = useControlPlaneClient();
  return useQuery({
    ...projectTopEndpointsQuery(client, projectId ?? "pending", filter),
    enabled: Boolean(projectId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Loads an organization's top endpoints by request count.
 *
 * @param organizationId Organization whose endpoints should be ranked; null disables the query.
 * @param filter Optional key filter, date range, and result limit.
 * @returns TanStack Query result containing endpoints sorted by request count, descending.
 */
export function useOrganizationTopEndpoints(
  organizationId: string | null,
  filter: UsageFilter & Readonly<{ limit?: number }> = {},
) {
  const client = useControlPlaneClient();
  return useQuery({
    ...organizationTopEndpointsQuery(client, organizationId ?? "pending", filter),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Loads a project's delivery analytics summary (event/notification counts,
 * success rate, latency, and channel mix).
 *
 * @param projectId Project whose analytics should be aggregated; null disables the query.
 * @param filter Optional key filter and date range (defaults to today).
 * @returns TanStack Query result containing the analytics summary.
 */
export function useProjectAnalytics(projectId: string | null, filter: AnalyticsFilter = {}) {
  const client = useControlPlaneClient();
  return useQuery({
    ...projectAnalyticsQuery(client, projectId ?? "pending", filter),
    enabled: Boolean(projectId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Loads an organization's delivery analytics summary (event/notification
 * counts, success rate, latency, and channel mix).
 *
 * @param organizationId Organization whose analytics should be aggregated; null disables the query.
 * @param filter Optional key filter and date range (defaults to today).
 * @returns TanStack Query result containing the analytics summary.
 */
export function useOrganizationAnalytics(
  organizationId: string | null,
  filter: AnalyticsFilter = {},
) {
  const client = useControlPlaneClient();
  return useQuery({
    ...organizationAnalyticsQuery(client, organizationId ?? "pending", filter),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Loads a project's delivery-status trend.
 *
 * @param projectId Project whose trend should be loaded; null disables the query.
 * @param filter Optional key filter, date range, and bucket granularity (defaults to today, by day).
 * @returns TanStack Query result containing the delivered/failed/queued/processing series.
 */
export function useProjectTrends(projectId: string | null, filter: TrendsFilter = {}) {
  const client = useControlPlaneClient();
  return useQuery({
    ...projectTrendsQuery(client, projectId ?? "pending", filter),
    enabled: Boolean(projectId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Loads an organization's delivery-status trend.
 *
 * @param organizationId Organization whose trend should be loaded; null disables the query.
 * @param filter Optional key filter, date range, and bucket granularity (defaults to today, by day).
 * @returns TanStack Query result containing the delivered/failed/queued/processing series.
 */
export function useOrganizationTrends(organizationId: string | null, filter: TrendsFilter = {}) {
  const client = useControlPlaneClient();
  return useQuery({
    ...organizationTrendsQuery(client, organizationId ?? "pending", filter),
    enabled: Boolean(organizationId),
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
