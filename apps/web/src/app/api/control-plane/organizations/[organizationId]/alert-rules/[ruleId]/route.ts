import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type OrganizationAlertRuleRouteContext = Readonly<{
  params: Promise<{ organizationId: string; ruleId: string }>;
}>;

async function forwardOrganizationAlertRule(
  request: NextRequest,
  context: OrganizationAlertRuleRouteContext,
) {
  const { organizationId, ruleId } = await context.params;
  if (!isControlPlaneId(organizationId) || !isControlPlaneId(ruleId)) {
    return invalidControlPlaneIdResponse();
  }
  return beacoAuth.forwardAuthenticated(
    request,
    `/organizations/${organizationId}/alert-rules/${ruleId}`,
  );
}

/**
 * Forwards an authenticated org-wide alert rule update to FastAPI.
 *
 * @param request Incoming request whose JSON body is forwarded unchanged.
 * @param context Dynamic organization and rule route parameters.
 * @returns Proxied response; FastAPI rejects a rule not owned by this organization.
 */
export function PUT(request: NextRequest, context: OrganizationAlertRuleRouteContext) {
  return forwardOrganizationAlertRule(request, context);
}

/**
 * Forwards an authenticated org-wide alert rule delete to FastAPI.
 *
 * @param request Incoming same-origin request containing HTTP-only session cookies.
 * @param context Dynamic organization and rule route parameters.
 * @returns Proxied response; FastAPI rejects a rule not owned by this organization.
 */
export function DELETE(request: NextRequest, context: OrganizationAlertRuleRouteContext) {
  return forwardOrganizationAlertRule(request, context);
}
