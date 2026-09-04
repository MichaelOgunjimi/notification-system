import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type UsageHourlyRouteContext = Readonly<{
  params: Promise<{ organizationId: string }>;
}>;

/**
 * Forwards an authenticated hour-of-day usage distribution to FastAPI.
 *
 * @param request Incoming same-origin request; its key/date-range query string is forwarded.
 * @param context Dynamic organization route parameters.
 * @returns Proxied hourly distribution after backend `organization:usage:read` checks.
 */
export async function GET(request: NextRequest, context: UsageHourlyRouteContext) {
  const { organizationId } = await context.params;
  if (!isControlPlaneId(organizationId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/organizations/${organizationId}/usage/hourly${request.nextUrl.search}`,
  );
}
