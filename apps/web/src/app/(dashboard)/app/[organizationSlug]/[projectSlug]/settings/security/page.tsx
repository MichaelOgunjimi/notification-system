"use client";

import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";
import { ApiKeysSettings } from "@/components/settings/api-keys-settings";

/**
 * Renders project API key management for the resolved dashboard scope.
 *
 * @returns API key settings surface bound to the active project.
 */
export default function SecuritySettingsPage() {
  const { organization, project } = useDashboardScope();
  return <ApiKeysSettings key={project.id} organization={organization} project={project} />;
}
