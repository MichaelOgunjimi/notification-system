"use client";

import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";
import { ProjectSettings } from "@/components/settings/project-settings";

/**
 * Renders project settings for the resolved dashboard scope.
 *
 * @returns Project settings surface bound to the active project.
 */
export default function ProjectSettingsPage() {
  const { organization, project } = useDashboardScope();
  return <ProjectSettings key={project.id} organization={organization} project={project} />;
}
