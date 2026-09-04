import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type TrendsRouteContext = Readonly<{
  params: Promise<{ organizationId: string }>;
}>;

/**
 * Forwards an authenticated organization delivery-status trend to FastAPI.
 *
 * @param request Incoming same-origin request; its key/date-range/granularity query string is forwarded.
 * @param context Dynamic organization route parameters.
 * @returns Proxied trend response after backend `organization:usage:read` checks.
 */
export async function GET(request: NextRequest, context: TrendsRouteContext) {
  const { organizationId } = await context.params;
  if (!isControlPlaneId(organizationId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/organizations/${organizationId}/analytics/trends${request.nextUrl.search}`,
  );
}
