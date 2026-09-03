"use client";

import { AUXILIARY_ROUTES } from "@/components/dashboard/dashboard-navigation";
import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";
import { AccountSettings } from "@/components/settings/account-settings";
import { dashboardPath } from "@/lib/dashboard-route";

/**
 * Renders account settings for the authenticated user inside the dashboard shell.
 *
 * @returns Account settings surface with a validated post-OAuth return path.
 */
export default function AccountSettingsPage() {
  const { user, organization, project } = useDashboardScope();
  const returnPath = `${dashboardPath(organization.slug, project.slug)}/${AUXILIARY_ROUTES.accountSettings.path}`;
  return <AccountSettings user={user} returnPath={returnPath} />;
}
