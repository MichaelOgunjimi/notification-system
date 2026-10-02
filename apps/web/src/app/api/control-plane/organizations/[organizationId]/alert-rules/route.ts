import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type OrganizationAlertRulesRouteContext = Readonly<{
  params: Promise<{ organizationId: string }>;
}>;

/**
 * Forwards an authenticated paginated list of an organization's org-wide
 * default alert rules to FastAPI.
 *
 * @param request Incoming same-origin request; its page query string is forwarded.
 * @param context Dynamic organization route parameters.
 * @returns Proxied paginated alert rule response after backend authorization.
 */
export async function GET(request: NextRequest, context: OrganizationAlertRulesRouteContext) {
  const { organizationId } = await context.params;
  if (!isControlPlaneId(organizationId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/organizations/${organizationId}/alert-rules${request.nextUrl.search}`,
  );
}

/**
 * Forwards an authenticated org-wide alert rule creation to FastAPI.
 *
 * @param request Incoming request whose JSON body is forwarded unchanged.
 * @param context Dynamic organization route parameters.
 * @returns Proxied response; FastAPI enforces the organization:manage capability.
 */
export async function POST(request: NextRequest, context: OrganizationAlertRulesRouteContext) {
  const { organizationId } = await context.params;
  if (!isControlPlaneId(organizationId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(request, `/organizations/${organizationId}/alert-rules`);
}
