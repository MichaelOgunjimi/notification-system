"use client";

import { Suspense } from "react";
import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";
import { EventsPage } from "@/components/events/events-page";

/**
 * Route entry for the project's event log.
 *
 * @returns The events surface bound to the resolved dashboard scope.
 */
export default function ProjectEventsPage() {
  const { organization, project, projects } = useDashboardScope();
  return (
    <Suspense>
      <EventsPage
        key={organization.id}
        organization={organization}
        project={project}
        projects={projects}
      />
    </Suspense>
  );
}
