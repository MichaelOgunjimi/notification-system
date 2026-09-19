import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type OrganizationTemplateDefaultsRouteContext = Readonly<{
  params: Promise<{ organizationId: string }>;
}>;

/**
 * Forwards an authenticated paginated list of the shared system default
 * templates to FastAPI (the organization id only authorizes the request).
 *
 * @param request Incoming same-origin request; its page/channel query string is forwarded.
 * @param context Dynamic organization route parameters.
 * @returns Proxied paginated template response after backend authorization.
 */
export async function GET(request: NextRequest, context: OrganizationTemplateDefaultsRouteContext) {
  const { organizationId } = await context.params;
  if (!isControlPlaneId(organizationId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/organizations/${organizationId}/templates/defaults${request.nextUrl.search}`,
  );
}
