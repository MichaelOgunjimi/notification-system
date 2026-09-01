import { DashboardContext } from "@/components/dashboard/dashboard-context";

type DashboardPageProps = Readonly<{
  params: Promise<{ organizationSlug: string; projectSlug: string }>;
}>;

/**
 * Resolves the canonical organization and project slugs into an authenticated
 * dashboard context.
 *
 * @param props Async dynamic route parameters supplied by Next.js.
 * @returns Membership-aware dashboard entry component.
 */
export default async function DashboardPage({ params }: DashboardPageProps) {
  const { organizationSlug, projectSlug } = await params;
  return <DashboardContext organizationSlug={organizationSlug} projectSlug={projectSlug} />;
}
