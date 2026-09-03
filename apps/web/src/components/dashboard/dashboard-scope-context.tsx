"use client";

import { createContext, useContext } from "react";
import type { User } from "@beaco/auth";
import type { Organization, Project } from "@beaco/control-plane";

/**
 * Canonical organization and project scope resolved once by the dashboard
 * layout and shared with every nested route.
 *
 * @property user Authenticated user backing the current session.
 * @property organization Membership-validated organization for the active route.
 * @property project Membership-validated project for the active route.
 * @property projects Sibling projects available within the organization.
 */
export type DashboardScopeValue = Readonly<{
  user: User;
  organization: Organization;
  project: Project;
  projects: Project[];
}>;

const DashboardScopeContext = createContext<DashboardScopeValue | null>(null);

export const DashboardScopeProvider = DashboardScopeContext.Provider;

/**
 * Reads the resolved dashboard scope provided by the project layout.
 *
 * @returns Validated user, organization, project, and sibling projects.
 * @throws When called outside a resolved dashboard route.
 */
export function useDashboardScope(): DashboardScopeValue {
  const value = useContext(DashboardScopeContext);
  if (value === null) {
    throw new Error("useDashboardScope must be used within a resolved dashboard route.");
  }
  return value;
}
