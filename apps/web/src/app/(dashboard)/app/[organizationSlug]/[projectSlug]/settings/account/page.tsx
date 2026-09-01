import { DashboardContext } from "@/components/dashboard/dashboard-context";

type AccountSettingsPageProps = Readonly<{
  params: Promise<{ organizationSlug: string; projectSlug: string }>;
}>;

/**
 * Resolves account settings inside a validated organization/project shell.
 *
 * @param props Async dynamic route parameters supplied by Next.js.
 * @returns Membership-aware dashboard context displaying account settings.
 */
export default async function AccountSettingsPage({ params }: AccountSettingsPageProps) {
  const { organizationSlug, projectSlug } = await params;
  return (
    <DashboardContext
      organizationSlug={organizationSlug}
      projectSlug={projectSlug}
      surface="account-settings"
    />
  );
}
