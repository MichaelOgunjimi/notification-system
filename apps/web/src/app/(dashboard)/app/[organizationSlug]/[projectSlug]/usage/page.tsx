"use client";

import { Suspense } from "react";
import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";
import { UsagePage } from "@/components/usage/usage-page";

/**
 * Route entry for the tenant API usage view.
 *
 * @returns The usage surface bound to the resolved dashboard scope.
 */
export default function ProjectUsagePage() {
  const { organization, project, projects } = useDashboardScope();
  return (
    <Suspense>
      <UsagePage
        key={organization.id}
        organization={organization}
        project={project}
        projects={projects}
      />
    </Suspense>
  );
}
