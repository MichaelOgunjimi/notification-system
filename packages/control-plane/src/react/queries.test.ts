import { describe, expect, it, vi } from "vitest";
import type { ControlPlaneClient } from "../types";
import { controlPlaneQueryKeys, organizationsQuery, projectsQuery } from "./queries";

describe("control-plane queries", () => {
  it("provides stable organization and project cache boundaries", async () => {
    const client: ControlPlaneClient = {
      organizations: { list: vi.fn().mockResolvedValue([]) },
      projects: { list: vi.fn().mockResolvedValue([]) },
    };

    const organizations = organizationsQuery(client);
    const projects = projectsQuery(client, "organization-1");

    expect(organizations.queryKey).toEqual(controlPlaneQueryKeys.organizations());
    expect(projects.queryKey).toEqual(controlPlaneQueryKeys.projects("organization-1"));
    await organizations.queryFn?.({} as never);
    await projects.queryFn?.({} as never);
    expect(client.organizations.list).toHaveBeenCalledOnce();
    expect(client.projects.list).toHaveBeenCalledWith("organization-1");
  });
});
