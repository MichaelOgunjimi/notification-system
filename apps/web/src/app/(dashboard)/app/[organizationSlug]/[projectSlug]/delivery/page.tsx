"use client";

import { Suspense } from "react";
import { DeliveryPage } from "@/components/delivery/delivery-page";
import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";

/** Route entry for the active project's notification delivery stream. */
export default function ProjectDeliveryPage() {
  const { organization, project } = useDashboardScope();
  return (
    <Suspense>
      <DeliveryPage organization={organization} project={project} />
    </Suspense>
  );
}
