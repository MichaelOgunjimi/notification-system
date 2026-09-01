export type OrganizationRole = "owner" | "admin" | "member" | "viewer";

export type Organization = Readonly<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: OrganizationRole;
}>;

export type Project = Readonly<{
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
}>;

export type ControlPlaneClientOptions = Readonly<{
  appControlPlanePath?: string;
  fetch?: typeof globalThis.fetch;
}>;

export interface ControlPlaneClient {
  readonly organizations: {
    list(): Promise<Organization[]>;
  };
  readonly projects: {
    list(organizationId: string): Promise<Project[]>;
  };
}

export type ApiOrganization = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: OrganizationRole;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

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
