import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type EventRouteContext = Readonly<{
  params: Promise<{ projectId: string; eventId: string }>;
}>;

/**
 * Forwards an authenticated fetch of one event and its fan-out notifications to FastAPI.
 *
 * @param request Incoming same-origin request containing HTTP-only session cookies.
 * @param context Dynamic project and event route parameters.
 * @returns Proxied response; FastAPI 404s an event not visible to this project.
 */
export async function GET(request: NextRequest, context: EventRouteContext) {
  const { projectId, eventId } = await context.params;
  if (!isControlPlaneId(projectId) || !isControlPlaneId(eventId)) {
    return invalidControlPlaneIdResponse();
  }
  return beacoAuth.forwardAuthenticated(request, `/projects/${projectId}/events/${eventId}`);
}
