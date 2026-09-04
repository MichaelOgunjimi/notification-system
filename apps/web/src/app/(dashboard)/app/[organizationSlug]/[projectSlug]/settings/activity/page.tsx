"use client";

import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";
import { ActivitySettings } from "@/components/settings/activity-settings";

/**
 * Renders the tenant activity log for the resolved dashboard scope.
 *
 * @returns Activity log surface bound to the active project and organization.
 */
export default function ActivitySettingsPage() {
  const { organization, project } = useDashboardScope();
  return <ActivitySettings key={project.id} organization={organization} project={project} />;
}
