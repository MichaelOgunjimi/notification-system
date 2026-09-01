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
