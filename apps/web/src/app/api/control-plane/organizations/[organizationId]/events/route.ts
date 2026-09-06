import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type OrganizationEventsRouteContext = Readonly<{
  params: Promise<{ organizationId: string }>;
}>;

/**
 * Forwards an authenticated paginated list of events spanning every project
 * in an organization to FastAPI.
 *
 * @param request Incoming same-origin request; its filter query string is forwarded.
 * @param context Dynamic organization route parameters.
 * @returns Proxied paginated event response after backend authorization.
 */
export async function GET(request: NextRequest, context: OrganizationEventsRouteContext) {
  const { organizationId } = await context.params;
  if (!isControlPlaneId(organizationId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/organizations/${organizationId}/events${request.nextUrl.search}`,
  );
}
