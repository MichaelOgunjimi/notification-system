import { describe, expect, it, vi } from "vitest";
import type { ControlPlaneClient } from "../types";
import {
  controlPlaneQueryKeys,
  organizationInvitationsQuery,
  organizationMembersQuery,
  organizationsQuery,
  projectApiKeysQuery,
  projectsQuery,
} from "./queries";

describe("control-plane queries", () => {
  it("provides stable organization and project cache boundaries", async () => {
    const client: ControlPlaneClient = {
      organizations: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
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
        accept: vi.fn(),
        preview: vi.fn(),
      },
      projects: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        archive: vi.fn(),
      },
      apiKeys: {
        list: vi.fn().mockResolvedValue({
          items: [],
          total: 0,
          page: 1,
          perPage: 20,
          totalPages: 0,
        }),
        create: vi.fn(),
        update: vi.fn(),
        revoke: vi.fn(),
        rotate: vi.fn(),
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

  it("scopes project API key queries by project and page", async () => {
    const client = {
      apiKeys: {
        list: vi.fn().mockResolvedValue({
          items: [],
          total: 0,
          page: 3,
          perPage: 10,
          totalPages: 0,
        }),
        create: vi.fn(),
        update: vi.fn(),
        revoke: vi.fn(),
        rotate: vi.fn(),
      },
    } as unknown as ControlPlaneClient;

    const first = projectApiKeysQuery(client, "project-1", { page: 1, perPage: 20 });
    const filtered = projectApiKeysQuery(client, "project-1", {
      page: 3,
      perPage: 10,
      environment: "live",
      status: "revoked",
    });

    expect(first.queryKey).toEqual([
      ...controlPlaneQueryKeys.projectApiKeys("project-1"),
      1,
      20,
      null,
      null,
    ]);
    expect(filtered.queryKey).toEqual([
      ...controlPlaneQueryKeys.projectApiKeys("project-1"),
      3,
      10,
      "live",
      "revoked",
    ]);
    await filtered.queryFn?.({} as never);
    expect(client.apiKeys.list).toHaveBeenCalledWith("project-1", {
      page: 3,
      perPage: 10,
      environment: "live",
      status: "revoked",
    });
  });
});
