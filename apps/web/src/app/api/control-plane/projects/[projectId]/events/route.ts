import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type ProjectEventsRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

/**
 * Forwards an authenticated paginated list of a project's events to FastAPI.
 *
 * @param request Incoming same-origin request; its page/status/priority/type/date query string is forwarded.
 * @param context Dynamic project route parameters.
 * @returns Proxied paginated event response after backend authorization.
 */
export async function GET(request: NextRequest, context: ProjectEventsRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/events${request.nextUrl.search}`,
  );
}
