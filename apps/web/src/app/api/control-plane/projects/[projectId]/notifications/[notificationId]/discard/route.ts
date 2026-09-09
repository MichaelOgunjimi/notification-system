import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type ProjectNotificationDiscardRouteContext = Readonly<{
  params: Promise<{ projectId: string; notificationId: string }>;
}>;

/**
 * Forwards an authenticated dead-letter discard request to FastAPI.
 *
 * @param request Same-origin request containing HTTP-only session cookies.
 * @param context Dynamic project and notification identifiers.
 * @returns The refreshed notification after the backend authorizes and discards the dead letter.
 */
export async function POST(request: NextRequest, context: ProjectNotificationDiscardRouteContext) {
  const { projectId, notificationId } = await context.params;
  if (!isControlPlaneId(projectId) || !isControlPlaneId(notificationId)) {
    return invalidControlPlaneIdResponse();
  }
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/notifications/${notificationId}/discard`,
  );
}
