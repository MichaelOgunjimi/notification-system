import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type OrganizationTemplatesRouteContext = Readonly<{
  params: Promise<{ organizationId: string }>;
}>;

/**
 * Forwards an authenticated paginated list of templates spanning every
 * project in an organization to FastAPI.
 *
 * @param request Incoming same-origin request; its page/channel/project_id query string is forwarded.
 * @param context Dynamic organization route parameters.
 * @returns Proxied paginated template response after backend authorization.
 */
export async function GET(request: NextRequest, context: OrganizationTemplatesRouteContext) {
  const { organizationId } = await context.params;
  if (!isControlPlaneId(organizationId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/organizations/${organizationId}/templates${request.nextUrl.search}`,
  );
}
