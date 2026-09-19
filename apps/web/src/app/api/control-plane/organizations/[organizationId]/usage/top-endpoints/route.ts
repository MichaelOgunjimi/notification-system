import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type TopEndpointsRouteContext = Readonly<{
  params: Promise<{ organizationId: string }>;
}>;

/**
 * Forwards an authenticated top-endpoints ranking to FastAPI.
 *
 * @param request Incoming same-origin request; its key/date-range/limit query string is forwarded.
 * @param context Dynamic organization route parameters.
 * @returns Proxied ranking after backend `organization:usage:read` checks.
 */
export async function GET(request: NextRequest, context: TopEndpointsRouteContext) {
  const { organizationId } = await context.params;
  if (!isControlPlaneId(organizationId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/organizations/${organizationId}/usage/top-endpoints${request.nextUrl.search}`,
  );
}
