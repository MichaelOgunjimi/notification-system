"use client";

import { Suspense } from "react";
import { AlertRulesPanel } from "@/components/alerts/alert-rules-panel";
import { DeliveryPage } from "@/components/delivery/delivery-page";
import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";

/** Route entry for the active project's alert rules and failed/dead-lettered deliveries. */
export default function ProjectAlertsPage() {
  const { organization, project } = useDashboardScope();
  return (
    <Suspense>
      <DeliveryPage
        organization={organization}
        project={project}
        restrictToIssues
        configPanel={<AlertRulesPanel organization={organization} project={project} />}
      />
    </Suspense>
  );
}
