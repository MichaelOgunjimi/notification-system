import { DashboardScope } from "@/components/dashboard/dashboard-scope";

type DashboardProjectLayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ organizationSlug: string; projectSlug: string }>;
}>;

/**
 * Resolves the organization and project scope once for every nested dashboard
 * route so surface pages render inside a shared, validated shell.
 *
 * @param props Nested route content and async dynamic route parameters.
 * @returns Membership-aware dashboard shell wrapping the active surface.
 */
export default async function DashboardProjectLayout({
  children,
  params,
}: DashboardProjectLayoutProps) {
  const { organizationSlug, projectSlug } = await params;
  return (
    <DashboardScope organizationSlug={organizationSlug} projectSlug={projectSlug}>
      {children}
    </DashboardScope>
  );
}
