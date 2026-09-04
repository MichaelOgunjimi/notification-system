import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type UsageRouteContext = Readonly<{
  params: Promise<{ organizationId: string }>;
}>;

/**
 * Forwards an authenticated page of an organization-wide usage list to FastAPI.
 *
 * @param request Incoming same-origin request; its page/date-range query string is forwarded.
 * @param context Dynamic organization route parameters.
 * @returns Proxied paginated usage response after backend `organization:usage:read` checks.
 */
export async function GET(request: NextRequest, context: UsageRouteContext) {
  const { organizationId } = await context.params;
  if (!isControlPlaneId(organizationId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/organizations/${organizationId}/usage${request.nextUrl.search}`,
  );
}
