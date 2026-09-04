import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type TopEndpointsRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

/**
 * Forwards an authenticated top-endpoints ranking to FastAPI.
 *
 * @param request Incoming same-origin request; its key/date-range/limit query string is forwarded.
 * @param context Dynamic project route parameters.
 * @returns Proxied ranking after backend `project:usage:read` checks.
 */
export async function GET(request: NextRequest, context: TopEndpointsRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/usage/top-endpoints${request.nextUrl.search}`,
  );
}
