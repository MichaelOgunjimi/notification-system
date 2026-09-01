type ApiOrganization = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: "owner" | "admin" | "member" | "viewer";
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type ApiProject = {
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

export type Organization = Readonly<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: ApiOrganization["role"];
}>;

export type Project = Readonly<{
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
}>;

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
  throw new Error(payload?.detail ?? "The workspace service is unavailable.");
}

export async function listOrganizations(): Promise<Organization[]> {
  const organizations = await readJson<ApiOrganization[]>(
    await fetch("/api/control-plane/organizations", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }),
  );
  return organizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    description: organization.description,
    role: organization.role,
  }));
}

export async function listProjects(organizationId: string): Promise<Project[]> {
  const projects = await readJson<ApiProject[]>(
    await fetch(`/api/control-plane/organizations/${organizationId}/projects`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }),
  );
  return projects.map((project) => ({
    id: project.id,
    organizationId: project.organization_id,
    name: project.name,
    slug: project.slug,
    description: project.description,
  }));
}
