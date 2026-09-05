"use client";

import { Suspense } from "react";
import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";
import { TemplatesPage } from "@/components/templates/templates-page";

/**
 * Route entry for the project's shared template library.
 *
 * @returns The templates surface bound to the resolved dashboard scope.
 */
export default function ProjectTemplatesPage() {
  const { organization, project, projects } = useDashboardScope();
  return (
    <Suspense>
      <TemplatesPage
        key={organization.id}
        organization={organization}
        project={project}
        projects={projects}
      />
    </Suspense>
  );
}
