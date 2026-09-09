import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type ProjectNotificationRouteContext = Readonly<{
  params: Promise<{ projectId: string; notificationId: string }>;
}>;

/**
 * Forwards an authenticated notification-detail request to FastAPI.
 *
 * @param request Same-origin request containing HTTP-only session cookies.
 * @param context Dynamic project and notification identifiers.
 * @returns The notification only when the backend confirms project membership.
 */
export async function GET(request: NextRequest, context: ProjectNotificationRouteContext) {
  const { projectId, notificationId } = await context.params;
  if (!isControlPlaneId(projectId) || !isControlPlaneId(notificationId)) {
    return invalidControlPlaneIdResponse();
  }
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/notifications/${notificationId}`,
  );
}
