"use client";

import { Suspense } from "react";
import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";
import { AuditLog } from "@/components/settings/audit-log";

/**
 * Renders the governance audit log for the resolved dashboard scope.
 *
 * @returns Audit log surface bound to the active organization and its projects.
 */
export default function AuditLogPage() {
  const { organization, project, projects } = useDashboardScope();
  return (
    <Suspense>
      <AuditLog
        key={organization.id}
        organization={organization}
        project={project}
        projects={projects}
      />
    </Suspense>
  );
}
