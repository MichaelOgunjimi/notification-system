import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type UsageSummaryRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

/**
 * Forwards an authenticated project usage summary to FastAPI.
 *
 * @param request Incoming same-origin request; its date-range query string is forwarded.
 * @param context Dynamic project route parameters.
 * @returns Proxied usage summary response after backend `project:usage:read` checks.
 */
export async function GET(request: NextRequest, context: UsageSummaryRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/usage/summary${request.nextUrl.search}`,
  );
}
