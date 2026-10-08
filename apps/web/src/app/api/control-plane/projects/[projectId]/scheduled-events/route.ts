import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type ProjectScheduledEventsRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

/**
 * Forwards an authenticated paginated list of a project's scheduled events to FastAPI.
 *
 * @param request Incoming same-origin request; its page/status query string is forwarded.
 * @param context Dynamic project route parameters.
 * @returns Proxied paginated scheduled event response after backend authorization.
 */
export async function GET(request: NextRequest, context: ProjectScheduledEventsRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/scheduled-events${request.nextUrl.search}`,
  );
}

/**
 * Forwards an authenticated scheduling request to FastAPI, which creates the event as the chosen
 * project API key after checking the key and the caller's capability.
 *
 * @param request Incoming same-origin request whose JSON body is forwarded unchanged.
 * @param context Dynamic project route parameters.
 * @returns Proxied `201` with the scheduled event, or the API's `422`/`403`/`429`.
 */
export async function POST(request: NextRequest, context: ProjectScheduledEventsRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(request, `/projects/${projectId}/scheduled-events`);
}
