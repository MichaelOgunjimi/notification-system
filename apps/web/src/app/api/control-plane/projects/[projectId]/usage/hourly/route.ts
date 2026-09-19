import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type UsageHourlyRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

/**
 * Forwards an authenticated hour-of-day usage distribution to FastAPI.
 *
 * @param request Incoming same-origin request; its key/date-range query string is forwarded.
 * @param context Dynamic project route parameters.
 * @returns Proxied hourly distribution after backend `project:usage:read` checks.
 */
export async function GET(request: NextRequest, context: UsageHourlyRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/usage/hourly${request.nextUrl.search}`,
  );
}
