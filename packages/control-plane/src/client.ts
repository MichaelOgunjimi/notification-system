import type {
  ApiOrganization,
  ApiOrganizationInvitation,
  ApiOrganizationMember,
  ApiProject,
  ControlPlaneClient,
  ControlPlaneClientOptions,
  Organization,
  OrganizationInvitation,
  OrganizationMember,
  Project,
} from "./types";
import { controlPlaneErrorFromResponse, controlPlaneNetworkError } from "./error";

const DEFAULT_CONTROL_PLANE_PATH = "/api/control-plane";

function mapOrganization(organization: ApiOrganization): Organization {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    description: organization.description,
    role: organization.role,
    capabilities: [...organization.capabilities],
  };
}

function mapProject(project: ApiProject): Project {
  return {
    id: project.id,
    organizationId: project.organization_id,
    name: project.name,
    slug: project.slug,
    description: project.description,
  };
}

function mapMember(member: ApiOrganizationMember): OrganizationMember {
  return {
    id: member.id,
    userId: member.user_id,
    email: member.email,
    name: member.name,
    role: member.role,
    joinedAt: member.joined_at,
  };
}

function mapInvitation(invitation: ApiOrganizationInvitation): OrganizationInvitation {
  return {
    id: invitation.id,
    organizationId: invitation.organization_id,
    email: invitation.email,
    role: invitation.role,
    invitedByUserId: invitation.invited_by_user_id,
    expiresAt: invitation.expires_at,
    acceptedAt: invitation.accepted_at,
    revokedAt: invitation.revoked_at,
    createdAt: invitation.created_at,
  };
}

/** HTTP implementation that communicates through an application's same-origin boundary. */
class HttpControlPlaneClient implements ControlPlaneClient {
  private readonly appControlPlanePath: string;
  private readonly fetcher: typeof globalThis.fetch;

  readonly organizations = {
    list: async (): Promise<Organization[]> => {
      const organizations = await this.get<ApiOrganization[]>("/organizations");
      return organizations.map(mapOrganization);
    },
    update: async (
      organizationId: string,
      changes: Parameters<ControlPlaneClient["organizations"]["update"]>[1],
    ): Promise<Organization> =>
      mapOrganization(
        await this.request<ApiOrganization>(
          `/organizations/${encodeURIComponent(organizationId)}`,
          "PATCH",
          changes,
        ),
      ),
    archive: async (organizationId: string): Promise<Organization> =>
      mapOrganization(
        await this.request<ApiOrganization>(
          `/organizations/${encodeURIComponent(organizationId)}`,
          "DELETE",
        ),
      ),
  };

  readonly members = {
    list: async (organizationId: string): Promise<OrganizationMember[]> => {
      const members = await this.get<ApiOrganizationMember[]>(
        `/organizations/${encodeURIComponent(organizationId)}/members`,
      );
      return members.map(mapMember);
    },
    updateRole: async (
      organizationId: string,
      membershipId: string,
      role: Parameters<ControlPlaneClient["members"]["updateRole"]>[2],
    ): Promise<OrganizationMember> =>
      mapMember(
        await this.request<ApiOrganizationMember>(
          `/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(membershipId)}`,
          "PATCH",
          { role },
        ),
      ),
    remove: async (organizationId: string, membershipId: string): Promise<void> => {
      await this.request<void>(
        `/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(membershipId)}`,
        "DELETE",
      );
    },
  };

  readonly invitations = {
    list: async (organizationId: string): Promise<OrganizationInvitation[]> => {
      const invitations = await this.get<ApiOrganizationInvitation[]>(
        `/organizations/${encodeURIComponent(organizationId)}/invitations`,
      );
      return invitations.map(mapInvitation);
    },
    create: async (
      organizationId: string,
      invitation: Parameters<ControlPlaneClient["invitations"]["create"]>[1],
    ): Promise<OrganizationInvitation> =>
      mapInvitation(
        await this.request<ApiOrganizationInvitation>(
          `/organizations/${encodeURIComponent(organizationId)}/invitations`,
          "POST",
          invitation,
        ),
      ),
    revoke: async (organizationId: string, invitationId: string): Promise<void> => {
      await this.request<void>(
        `/organizations/${encodeURIComponent(organizationId)}/invitations/${encodeURIComponent(invitationId)}`,
        "DELETE",
      );
    },
  };

  readonly projects = {
    list: async (organizationId: string): Promise<Project[]> => {
      const projects = await this.get<ApiProject[]>(
        `/organizations/${encodeURIComponent(organizationId)}/projects`,
      );
      return projects.map(mapProject);
    },
    create: async (
      organizationId: string,
      project: Parameters<ControlPlaneClient["projects"]["create"]>[1],
    ): Promise<Project> =>
      mapProject(
        await this.request<ApiProject>(
          `/organizations/${encodeURIComponent(organizationId)}/projects`,
          "POST",
          project,
        ),
      ),
    archive: async (projectId: string): Promise<Project> =>
      mapProject(
        await this.request<ApiProject>(`/projects/${encodeURIComponent(projectId)}`, "DELETE"),
      ),
  };

  /**
   * Creates an HTTP control-plane client without taking custody of auth tokens.
   *
   * @param options Route and transport configuration supplied by the host application.
   */
  constructor(options: ControlPlaneClientOptions = {}) {
    this.appControlPlanePath = (options.appControlPlanePath ?? DEFAULT_CONTROL_PLANE_PATH).replace(
      /\/$/,
      "",
    );
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>(path, "GET");
  }

  private async request<T>(path: string, method: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.appControlPlanePath}${path}`, {
        method,
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw controlPlaneNetworkError(error);
    }
    if (!response.ok) {
      throw await controlPlaneErrorFromResponse(response, "The workspace service is unavailable.");
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

/**
 * Creates a browser-safe client for organization and project operations.
 *
 * Requests use same-origin credentials so the host application's HTTP-only
 * session cookies remain inaccessible to this package.
 *
 * @param options Optional application route and fetch transport overrides.
 * @returns Configured control-plane client.
 */
export function createControlPlaneClient(
  options: ControlPlaneClientOptions = {},
): ControlPlaneClient {
  return new HttpControlPlaneClient(options);
}

/** Shared client bound to the default `/api/control-plane` application route. */
export const controlPlaneClient = createControlPlaneClient();
