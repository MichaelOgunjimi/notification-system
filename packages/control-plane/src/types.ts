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
 * Fields required to create an organization. The first project is created in
 * the same request, so its name and slug are supplied by the caller.
 */
export type OrganizationCreate = Readonly<{
  name: string;
  slug: string;
  description?: string | null;
  project: Readonly<{ name: string; slug: string }>;
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

/** Editable fields accepted by the project settings endpoint. */
export type ProjectUpdate = Readonly<{
  name?: string;
  slug?: string;
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

/** One page of a paginated collection returned by a control-plane endpoint. */
export type Paginated<T> = Readonly<{
  items: readonly T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}>;

/** Environment a project API key authenticates against. */
export type ProjectApiKeyEnvironment = "test" | "live";

/** Permission a project API key may be granted against the notification API. */
export type ApiKeyScope =
  | "events:read"
  | "events:write"
  | "templates:read"
  | "templates:write"
  | "notifications:read"
  | "scheduled_events:read"
  | "scheduled_events:write"
  | "suppressions:read"
  | "suppressions:write"
  | "alerts:read"
  | "alerts:write"
  | "analytics:read"
  | "dead_letters:read"
  | "dead_letters:write"
  | "usage:read"
  | "audit:read"
  | "settings:read";

/**
 * Project API key metadata. The plaintext key is never included here; it is
 * returned once by {@link ControlPlaneClient.apiKeys.create} and `rotate`.
 */
export type ProjectApiKey = Readonly<{
  id: string;
  projectId: string;
  keyPrefix: string;
  name: string;
  description: string | null;
  environment: ProjectApiKeyEnvironment;
  scopes: readonly ApiKeyScope[];
  isActive: boolean;
  rateLimitPerMin: number | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  /** The key this one replaced when it was created by rotation, else null. */
  rotatedFromId: string | null;
}>;

/** Whether an API key list is scoped to active or revoked keys. */
export type ProjectApiKeyStatus = "active" | "revoked";

/** Optional filters and pagination for {@link ControlPlaneClient.apiKeys.list}. */
export type ProjectApiKeyListOptions = Readonly<{
  page?: number;
  perPage?: number;
  environment?: ProjectApiKeyEnvironment;
  status?: ProjectApiKeyStatus;
}>;

/** Project API key including the one-time plaintext secret. */
export type CreatedProjectApiKey = ProjectApiKey & Readonly<{ key: string }>;

/** Fields accepted when creating a project API key. */
export type ProjectApiKeyCreate = Readonly<{
  name: string;
  description?: string | null;
  scopes: readonly ApiKeyScope[];
  rateLimitPerMin?: number | null;
  environment?: ProjectApiKeyEnvironment;
}>;

/** Editable fields accepted by the project API key update endpoint. */
export type ProjectApiKeyUpdate = Readonly<{
  name?: string;
  description?: string | null;
  scopes?: readonly ApiKeyScope[];
  rateLimitPerMin?: number | null;
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
     * Creates an organization owned by the current user. The backend also seeds
     * a default project so the workspace is immediately usable.
     *
     * @param organization Name, URL slug, and optional description.
     * @returns The created organization including the caller's owner capabilities.
     * @throws {ControlPlaneError} When the slug conflicts or validation fails.
     */
    create(organization: OrganizationCreate): Promise<Organization>;
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
     * Updates a project's name, slug, or description.
     *
     * @param projectId Stable project identifier.
     * @param changes Fields to update; omitted fields remain unchanged.
     * @returns Updated project record.
     * @throws {ControlPlaneError} When the slug conflicts or `project:manage` is unavailable.
     */
    update(projectId: string, changes: ProjectUpdate): Promise<Project>;
    /**
     * Archives a project and removes it from active listings.
     *
     * @param projectId Stable project identifier.
     * @returns Archived project record.
     * @throws {ControlPlaneError} When project-management access is unavailable.
     */
    archive(projectId: string): Promise<Project>;
  };
  /** Project API key operations; every request requires the `api_key:manage` capability. */
  readonly apiKeys: {
    /**
     * Lists a project's API keys, newest and active first.
     *
     * @param projectId Stable project identifier.
     * @param options Optional 1-based page and page size (1-100, default 20).
     * @returns One page of API key metadata without plaintext secrets.
     * @throws {ControlPlaneError} When API key management access is unavailable.
     */
    list(projectId: string, options?: ProjectApiKeyListOptions): Promise<Paginated<ProjectApiKey>>;
    /**
     * Creates a project API key.
     *
     * @param projectId Stable project identifier.
     * @param input Name, scopes (at least one), and optional description, rate limit, environment.
     * @returns The new key including its one-time plaintext secret.
     * @throws {ControlPlaneError} When validation or authorization fails.
     */
    create(projectId: string, input: ProjectApiKeyCreate): Promise<CreatedProjectApiKey>;
    /**
     * Updates a project API key's name, description, scopes, or rate limit.
     *
     * @param projectId Stable project identifier.
     * @param apiKeyId Stable API key identifier.
     * @param changes Fields to update; omitted fields remain unchanged.
     * @returns Updated API key metadata.
     * @throws {ControlPlaneError} When the key is revoked or access is denied.
     */
    update(
      projectId: string,
      apiKeyId: string,
      changes: ProjectApiKeyUpdate,
    ): Promise<ProjectApiKey>;
    /**
     * Revokes a project API key. The record is retained for audit history.
     *
     * @param projectId Stable project identifier.
     * @param apiKeyId Stable API key identifier.
     * @returns Promise resolved after revocation succeeds.
     * @throws {ControlPlaneError} When the key cannot be managed.
     */
    revoke(projectId: string, apiKeyId: string): Promise<void>;
    /**
     * Rotates a project API key: revokes the current key and issues a
     * replacement carrying the same configuration.
     *
     * @param projectId Stable project identifier.
     * @param apiKeyId Stable identifier of the key to rotate.
     * @returns The replacement key including its one-time plaintext secret.
     * @throws {ControlPlaneError} When the key is already revoked or access is denied.
     */
    rotate(projectId: string, apiKeyId: string): Promise<CreatedProjectApiKey>;
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

/** Raw paginated collection envelope returned by FastAPI. */
export type ApiPaginated<T> = {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
};

/** Raw project API key payload returned by FastAPI. */
export type ApiProjectApiKey = {
  id: string;
  project_id: string;
  key_prefix: string;
  name: string;
  description: string | null;
  environment: ProjectApiKeyEnvironment;
  scopes: ApiKeyScope[];
  is_active: boolean;
  rate_limit_per_min: number | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  rotated_from_id: string | null;
};

/** Raw project API key payload including the one-time plaintext secret. */
export type ApiCreatedProjectApiKey = ApiProjectApiKey & { key: string };
