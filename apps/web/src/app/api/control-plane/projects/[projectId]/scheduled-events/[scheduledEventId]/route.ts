import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type ScheduledEventRouteContext = Readonly<{
  params: Promise<{ projectId: string; scheduledEventId: string }>;
}>;

async function forwardScheduledEvent(request: NextRequest, context: ScheduledEventRouteContext) {
  const { projectId, scheduledEventId } = await context.params;
  if (!isControlPlaneId(projectId) || !isControlPlaneId(scheduledEventId)) {
    return invalidControlPlaneIdResponse();
  }
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/scheduled-events/${scheduledEventId}`,
  );
}

/**
 * Forwards an authenticated fetch of one scheduled event to FastAPI.
 *
 * @param request Incoming same-origin request containing HTTP-only session cookies.
 * @param context Dynamic project and scheduled event route parameters.
 * @returns Proxied response; FastAPI 404s an event not visible to this project.
 */
export function GET(request: NextRequest, context: ScheduledEventRouteContext) {
  return forwardScheduledEvent(request, context);
}

/**
 * Forwards an authenticated cancellation of a pending scheduled event to FastAPI.
 *
 * @param request Incoming same-origin request containing HTTP-only session cookies.
 * @param context Dynamic project and scheduled event route parameters.
 * @returns Proxied `204`, or FastAPI's `409` once the event is no longer pending.
 */
export function DELETE(request: NextRequest, context: ScheduledEventRouteContext) {
  return forwardScheduledEvent(request, context);
}
