import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type UsageRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

/**
 * Forwards an authenticated page of a project's hourly usage to FastAPI.
 *
 * @param request Incoming same-origin request; its page/date-range query string is forwarded.
 * @param context Dynamic project route parameters.
 * @returns Proxied paginated usage response after backend `project:usage:read` checks.
 */
export async function GET(request: NextRequest, context: UsageRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/usage${request.nextUrl.search}`,
  );
}
