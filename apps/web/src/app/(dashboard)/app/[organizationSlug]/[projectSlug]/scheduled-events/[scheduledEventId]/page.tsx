"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";
import { ScheduledEventDetailPage } from "@/components/scheduled-events/scheduled-event-detail-page";

/**
 * Route entry for a single scheduled event's detail view.
 *
 * @returns The scheduled event detail surface bound to the resolved dashboard scope.
 */
export default function ProjectScheduledEventDetailPage() {
  const { organization, project } = useDashboardScope();
  const params = useParams<{ scheduledEventId: string }>();
  return (
    <Suspense>
      <ScheduledEventDetailPage
        key={`${organization.id}-${params.scheduledEventId}`}
        organization={organization}
        project={project}
        scheduledEventId={params.scheduledEventId}
      />
    </Suspense>
  );
}
