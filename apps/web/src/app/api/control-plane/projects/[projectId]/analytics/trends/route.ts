import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type TrendsRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

/**
 * Forwards an authenticated project delivery-status trend to FastAPI.
 *
 * @param request Incoming same-origin request; its key/date-range/granularity query string is forwarded.
 * @param context Dynamic project route parameters.
 * @returns Proxied trend response after backend `project:usage:read` checks.
 */
export async function GET(request: NextRequest, context: TrendsRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/analytics/trends${request.nextUrl.search}`,
  );
}
