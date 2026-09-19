import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type UsageSummaryRouteContext = Readonly<{
  params: Promise<{ organizationId: string }>;
}>;

/**
 * Forwards an authenticated organization usage summary to FastAPI.
 *
 * @param request Incoming same-origin request; its date-range query string is forwarded.
 * @param context Dynamic organization route parameters.
 * @returns Proxied usage summary response after backend `organization:usage:read` checks.
 */
export async function GET(request: NextRequest, context: UsageSummaryRouteContext) {
  const { organizationId } = await context.params;
  if (!isControlPlaneId(organizationId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/organizations/${organizationId}/usage/summary${request.nextUrl.search}`,
  );
}
