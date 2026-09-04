import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type AnalyticsRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

/**
 * Forwards an authenticated project delivery analytics summary to FastAPI.
 *
 * @param request Incoming same-origin request; its key/date-range query string is forwarded.
 * @param context Dynamic project route parameters.
 * @returns Proxied analytics response after backend `project:usage:read` checks.
 */
export async function GET(request: NextRequest, context: AnalyticsRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/analytics${request.nextUrl.search}`,
  );
}
