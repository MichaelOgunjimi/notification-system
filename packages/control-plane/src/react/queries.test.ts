import { describe, expect, it, vi } from "vitest";
import type { ControlPlaneClient } from "../types";
import {
  controlPlaneQueryKeys,
  organizationInvitationsQuery,
  organizationMembersQuery,
  organizationsQuery,
  projectsQuery,
} from "./queries";

describe("control-plane queries", () => {
  it("provides stable organization and project cache boundaries", async () => {
    const client: ControlPlaneClient = {
      organizations: {
        list: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        archive: vi.fn(),
      },
      members: {
        list: vi.fn().mockResolvedValue([]),
        updateRole: vi.fn(),
        remove: vi.fn(),
      },
      invitations: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        revoke: vi.fn(),
      },
      projects: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        archive: vi.fn(),
      },
    };

    const organizations = organizationsQuery(client);
    const projects = projectsQuery(client, "organization-1");
    const members = organizationMembersQuery(client, "organization-1");
    const invitations = organizationInvitationsQuery(client, "organization-1");

    expect(organizations.queryKey).toEqual(controlPlaneQueryKeys.organizations());
    expect(projects.queryKey).toEqual(controlPlaneQueryKeys.projects("organization-1"));
    expect(members.queryKey).toEqual(controlPlaneQueryKeys.members("organization-1"));
    expect(invitations.queryKey).toEqual(controlPlaneQueryKeys.invitations("organization-1"));
    await organizations.queryFn?.({} as never);
    await projects.queryFn?.({} as never);
    await members.queryFn?.({} as never);
    await invitations.queryFn?.({} as never);
    expect(client.organizations.list).toHaveBeenCalledOnce();
    expect(client.projects.list).toHaveBeenCalledWith("organization-1");
    expect(client.members.list).toHaveBeenCalledWith("organization-1");
    expect(client.invitations.list).toHaveBeenCalledWith("organization-1");
  });
});
