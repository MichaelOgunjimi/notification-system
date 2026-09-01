import type {
  ApiOrganization,
  ApiProject,
  ControlPlaneClient,
  ControlPlaneClientOptions,
  Organization,
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

/** HTTP implementation that communicates through an application's same-origin boundary. */
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
      throw await controlPlaneErrorFromResponse(response, "The workspace service is unavailable.");
    }
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
