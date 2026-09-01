import type {
  ApiOrganization,
  ApiProject,
  ControlPlaneClient,
  ControlPlaneClientOptions,
  Organization,
  Project,
} from "./types";
import {
  controlPlaneErrorFromResponse,
  controlPlaneNetworkError,
} from "./error";

const DEFAULT_CONTROL_PLANE_PATH = "/api/control-plane";

function mapOrganization(organization: ApiOrganization): Organization {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    description: organization.description,
    role: organization.role,
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

class HttpControlPlaneClient implements ControlPlaneClient {
  private readonly appControlPlanePath: string;
  private readonly fetcher: typeof globalThis.fetch;

  readonly organizations = {
    list: async (): Promise<Organization[]> => {
      const organizations = await this.get<ApiOrganization[]>("/organizations");
      return organizations.map(mapOrganization);
    },
  };

  readonly projects = {
    list: async (organizationId: string): Promise<Project[]> => {
      const projects = await this.get<ApiProject[]>(
        `/organizations/${encodeURIComponent(organizationId)}/projects`,
      );
      return projects.map(mapProject);
    },
  };

  constructor(options: ControlPlaneClientOptions = {}) {
    this.appControlPlanePath = (
      options.appControlPlanePath ?? DEFAULT_CONTROL_PLANE_PATH
    ).replace(/\/$/, "");
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async get<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.appControlPlanePath}${path}`, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
    } catch (error) {
      throw controlPlaneNetworkError(error);
    }
    if (!response.ok) {
      throw await controlPlaneErrorFromResponse(
        response,
        "The workspace service is unavailable.",
      );
    }
    return (await response.json()) as T;
  }
}

export function createControlPlaneClient(
  options: ControlPlaneClientOptions = {},
): ControlPlaneClient {
  return new HttpControlPlaneClient(options);
}

export const controlPlaneClient = createControlPlaneClient();
