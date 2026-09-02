import { DashboardContext } from "@/components/dashboard/dashboard-context";

type OrganizationSettingsPageProps = Readonly<{
  params: Promise<{ organizationSlug: string; projectSlug: string }>;
}>;

/**
 * Resolves organization settings inside a validated organization/project shell.
 *
 * @param props Async dynamic route parameters supplied by Next.js.
 * @returns Membership-aware dashboard context displaying organization settings.
 */
export default async function OrganizationSettingsPage({ params }: OrganizationSettingsPageProps) {
  const { organizationSlug, projectSlug } = await params;
  return (
    <DashboardContext
      organizationSlug={organizationSlug}
      projectSlug={projectSlug}
      surface="organization-settings"
    />
  );
}
