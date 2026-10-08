"use client";

import { Suspense } from "react";
import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";
import { ScheduledEventsPage } from "@/components/scheduled-events/scheduled-events-page";

/**
 * Route entry for the project's scheduled events.
 *
 * @returns The scheduled events surface bound to the resolved dashboard scope.
 */
export default function ProjectScheduledEventsPage() {
  const { organization, project } = useDashboardScope();
  return (
    <Suspense>
      <ScheduledEventsPage
        key={`${organization.id}-${project.id}`}
        organization={organization}
        project={project}
      />
    </Suspense>
  );
}
