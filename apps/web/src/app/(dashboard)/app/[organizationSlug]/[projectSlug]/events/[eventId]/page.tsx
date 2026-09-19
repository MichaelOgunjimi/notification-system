"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";
import { EventDetailPage } from "@/components/events/event-detail-page";

/**
 * Route entry for a single event's detail view.
 *
 * @returns The event detail surface bound to the resolved dashboard scope.
 */
export default function ProjectEventDetailPage() {
  const { organization, project } = useDashboardScope();
  const params = useParams<{ eventId: string }>();
  return (
    <Suspense>
      <EventDetailPage
        key={`${organization.id}-${params.eventId}`}
        organization={organization}
        project={project}
        eventId={params.eventId}
      />
    </Suspense>
  );
}
