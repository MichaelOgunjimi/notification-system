"use client";

import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";
import { OrganizationSettings } from "@/components/settings/organization-settings";

/**
 * Renders organization settings for the resolved dashboard scope.
 *
 * @returns Organization settings surface bound to the active organization.
 */
export default function OrganizationSettingsPage() {
  const { user, organization, project, projects } = useDashboardScope();
  return (
    <OrganizationSettings
      key={organization.id}
      userId={user.id}
      organization={organization}
      project={project}
      projects={projects}
    />
  );
}
