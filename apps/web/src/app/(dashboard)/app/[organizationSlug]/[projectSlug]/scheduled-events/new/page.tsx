"use client";

import { Suspense } from "react";
import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";
import { ScheduledEventFormPage } from "@/components/scheduled-events/scheduled-event-form-page";

/**
 * Route entry for scheduling a new event from the dashboard.
 *
 * @returns The schedule form bound to the resolved dashboard scope.
 */
export default function ProjectScheduleEventPage() {
  const { organization, project } = useDashboardScope();
  return (
    <Suspense>
      <ScheduledEventFormPage
        key={`${organization.id}-${project.id}`}
        organization={organization}
        project={project}
      />
    </Suspense>
  );
}
