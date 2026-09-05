"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";
import { TemplateDetailPage } from "@/components/templates/template-detail-page";

/**
 * Route entry for a single template's detail view.
 *
 * @returns The template detail surface bound to the resolved dashboard scope.
 */
export default function ProjectTemplateDetailPage() {
  const { organization, project } = useDashboardScope();
  const params = useParams<{ templateId: string }>();
  return (
    <Suspense>
      <TemplateDetailPage
        key={`${organization.id}-${params.templateId}`}
        organization={organization}
        project={project}
        templateId={params.templateId}
      />
    </Suspense>
  );
}
