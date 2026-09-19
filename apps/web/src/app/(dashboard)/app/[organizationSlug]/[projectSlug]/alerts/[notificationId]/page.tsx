"use client";

import { useParams } from "next/navigation";
import { DeliveryDetailPage } from "@/components/delivery/delivery-detail-page";
import { useDashboardScope } from "@/components/dashboard/dashboard-scope-context";

/** Route entry for one alerted notification, opened from the Alerts surface. */
export default function ProjectAlertDetailPage() {
  const { organization, project } = useDashboardScope();
  const { notificationId } = useParams<{ notificationId: string }>();
  return (
    <DeliveryDetailPage
      organization={organization}
      project={project}
      notificationId={notificationId}
      basePath="alerts"
    />
  );
}
