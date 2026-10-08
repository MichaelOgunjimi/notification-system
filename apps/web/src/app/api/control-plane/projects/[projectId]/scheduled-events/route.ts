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
