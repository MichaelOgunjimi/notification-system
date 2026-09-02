/** Membership role that determines a user's organization-level capabilities. */
export type OrganizationRole = "owner" | "admin" | "member" | "viewer";

/** Backend-derived operation that the current user may perform in an organization. */
export type OrganizationCapability =
  | "organization:read"
  | "organization:manage"
  | "organization:members:manage"
  | "project:create"
  | "project:manage"
  | "api_key:manage"
  | "project:usage:read"
  | "project:audit:read"
  | "organization:usage:read"
  | "organization:audit:read"
  | "organization:billing:manage"
  | "organization:delete";

/**
 * Organization visible to the authenticated user.
 *
 * @property id Stable backend identifier used by control-plane endpoints.
 * @property name Human-readable organization name.
 * @property slug URL-safe organization identifier.
 * @property description Optional organization summary.
 * @property role Current user's membership role in the organization.
 * @property capabilities Backend-derived operations available to the current user.
 */
export type Organization = Readonly<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: OrganizationRole;
  capabilities: readonly OrganizationCapability[];
}>;

/** Editable fields accepted by the organization settings endpoint. */
export type OrganizationUpdate = Readonly<{
  name?: string;
  slug?: string;
  description?: string | null;
}>;

/**
 * Project belonging to an organization available to the authenticated user.
 *
 * @property id Stable backend project identifier.
 * @property organizationId Identifier of the owning organization.
 * @property name Human-readable project name.
 * @property slug URL-safe identifier unique within the organization.
 * @property description Optional project summary.
 */
export type Project = Readonly<{
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
}>;

/** Fields accepted when creating a project inside an organization. */
export type ProjectCreate = Readonly<{
  name: string;
  slug: string;
  description?: string | null;
}>;

/** Organization member visible to users allowed to inspect membership. */
export type OrganizationMember = Readonly<{
  id: string;
  userId: string;
  email: string;
  name: string;
  role: OrganizationRole;
  joinedAt: string;
}>;

/** Pending invitation issued for an organization. */
export type OrganizationInvitation = Readonly<{
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  invitedByUserId: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}>;

/** Fields required to invite a member to an organization. */
export type OrganizationInvitationCreate = Readonly<{
  email: string;
  role: OrganizationRole;
}>;

/**
 * Configuration for a browser-facing control-plane client.
 *
 * @property appControlPlanePath Same-origin application boundary that holds session cookies.
 * @property fetch Optional transport override for tests or non-browser hosts.
 */
export type ControlPlaneClientOptions = Readonly<{
  appControlPlanePath?: string;
  fetch?: typeof globalThis.fetch;
}>;

/** Browser-safe interface for authenticated organization and project operations. */
export interface ControlPlaneClient {
  /** Organization operations available to the current user. */
  readonly organizations: {
    /**
     * Lists active organizations the authenticated user can access.
     *
     * @returns Application-facing organization records.
     * @throws {ControlPlaneError} When the application boundary or backend rejects the request.
     */
    list(): Promise<Organization[]>;
    /**
     * Updates organization-owned profile fields.
     *
     * @param organizationId Stable organization identifier.
     * @param changes Fields to update; omitted fields remain unchanged.
     * @returns Updated organization including the caller's effective capabilities.
     * @throws {ControlPlaneError} When validation, authorization, or transport fails.
     */
    update(organizationId: string, changes: OrganizationUpdate): Promise<Organization>;
    /**
     * Archives an organization and removes it from active listings.
     *
     * @param organizationId Stable organization identifier.
     * @returns Archived organization record.
     * @throws {ControlPlaneError} When the owner requirement or request fails.
     */
    archive(organizationId: string): Promise<Organization>;
  };
  /** Membership operations scoped by organization authorization. */
  readonly members: {
    /**
     * Lists active organization memberships.
     *
     * @param organizationId Stable organization identifier.
     * @returns Member records visible to the authenticated caller.
     * @throws {ControlPlaneError} When membership cannot be verified.
     */
    list(organizationId: string): Promise<OrganizationMember[]>;
    /**
     * Changes the role assigned to an existing membership.
     *
     * @param organizationId Stable organization identifier.
     * @param membershipId Stable membership identifier.
     * @param role New organization role.
     * @returns Updated member record.
     * @throws {ControlPlaneError} When capability or owner invariants reject the change.
     */
    updateRole(
      organizationId: string,
      membershipId: string,
      role: OrganizationRole,
    ): Promise<OrganizationMember>;
    /**
     * Removes an existing membership.
     *
     * @param organizationId Stable organization identifier.
     * @param membershipId Stable membership identifier.
     * @returns Promise resolved after removal succeeds.
     * @throws {ControlPlaneError} When capability or final-owner rules reject removal.
     */
    remove(organizationId: string, membershipId: string): Promise<void>;
  };
  /** Pending organization invitation operations. */
  readonly invitations: {
    /**
     * Lists invitations for an organization.
     *
     * @param organizationId Stable organization identifier.
     * @returns Invitation history; consumers can filter accepted and revoked entries.
     * @throws {ControlPlaneError} When member-management access is unavailable.
     */
    list(organizationId: string): Promise<OrganizationInvitation[]>;
    /**
     * Invites an email address to join an organization.
     *
     * @param organizationId Stable organization identifier.
     * @param invitation Verified email and non-owner role to invite.
     * @returns Created or renewed invitation record.
     * @throws {ControlPlaneError} When validation, delivery, or authorization fails.
     */
    create(
      organizationId: string,
      invitation: OrganizationInvitationCreate,
    ): Promise<OrganizationInvitation>;
    /**
     * Revokes a pending organization invitation.
     *
     * @param organizationId Stable organization identifier.
     * @param invitationId Stable invitation identifier.
     * @returns Promise resolved after revocation succeeds.
     * @throws {ControlPlaneError} When the invitation cannot be managed.
     */
    revoke(organizationId: string, invitationId: string): Promise<void>;
  };
  /** Project operations scoped by organization membership. */
  readonly projects: {
    /**
     * Lists active projects visible within an organization.
     *
     * @param organizationId Stable identifier of the organization to inspect.
     * @returns Application-facing project records belonging to the organization.
     * @throws {ControlPlaneError} When access is denied or the service is unavailable.
     */
    list(organizationId: string): Promise<Project[]>;
    /**
     * Creates a project inside an organization.
     *
     * @param organizationId Stable organization identifier.
     * @param project Project profile fields.
     * @returns Newly created project.
     * @throws {ControlPlaneError} When capability, validation, or transport fails.
     */
    create(organizationId: string, project: ProjectCreate): Promise<Project>;
    /**
     * Archives a project and removes it from active listings.
     *
     * @param projectId Stable project identifier.
     * @returns Archived project record.
     * @throws {ControlPlaneError} When project-management access is unavailable.
     */
    archive(projectId: string): Promise<Project>;
  };
}

/** Raw organization payload returned by the FastAPI control-plane endpoint. */
export type ApiOrganization = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: OrganizationRole;
  capabilities: OrganizationCapability[];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

/** Raw project payload returned by the FastAPI control-plane endpoint. */
export type ApiProject = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

/** Raw organization membership payload returned by FastAPI. */
export type ApiOrganizationMember = {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: OrganizationRole;
  joined_at: string;
};

/** Raw organization invitation payload returned by FastAPI. */
export type ApiOrganizationInvitation = {
  id: string;
  organization_id: string;
  email: string;
  role: OrganizationRole;
  invited_by_user_id: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};
