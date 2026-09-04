import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type AnalyticsRouteContext = Readonly<{
  params: Promise<{ organizationId: string }>;
}>;

/**
 * Forwards an authenticated organization delivery analytics summary to FastAPI.
 *
 * @param request Incoming same-origin request; its key/date-range query string is forwarded.
 * @param context Dynamic organization route parameters.
 * @returns Proxied analytics response after backend `organization:usage:read` checks.
 */
export async function GET(request: NextRequest, context: AnalyticsRouteContext) {
  const { organizationId } = await context.params;
  if (!isControlPlaneId(organizationId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/organizations/${organizationId}/analytics${request.nextUrl.search}`,
  );
}
