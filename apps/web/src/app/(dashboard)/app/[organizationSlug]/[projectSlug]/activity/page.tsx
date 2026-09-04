"use client";

import { Suspense } from "react";
import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";
import { ActivityLog } from "@/components/activity/activity-log";

/**
 * Route entry for the operational activity view.
 *
 * @returns The activity surface bound to the resolved dashboard scope.
 */
export default function ActivityLogPage() {
  const { organization, project, projects } = useDashboardScope();
  return (
    <Suspense>
      <ActivityLog
        key={organization.id}
        organization={organization}
        project={project}
        projects={projects}
      />
    </Suspense>
  );
}
