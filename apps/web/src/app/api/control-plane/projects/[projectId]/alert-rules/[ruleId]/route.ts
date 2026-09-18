import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type AlertRuleRouteContext = Readonly<{
  params: Promise<{ projectId: string; ruleId: string }>;
}>;

async function forwardAlertRule(request: NextRequest, context: AlertRuleRouteContext) {
  const { projectId, ruleId } = await context.params;
  if (!isControlPlaneId(projectId) || !isControlPlaneId(ruleId)) {
    return invalidControlPlaneIdResponse();
  }
  return beacoAuth.forwardAuthenticated(request, `/projects/${projectId}/alert-rules/${ruleId}`);
}

/**
 * Forwards an authenticated alert rule update to FastAPI.
 *
 * @param request Incoming request whose JSON body is forwarded unchanged.
 * @param context Dynamic project and rule route parameters.
 * @returns Proxied response; FastAPI 404s a rule not owned by this project.
 */
export function PUT(request: NextRequest, context: AlertRuleRouteContext) {
  return forwardAlertRule(request, context);
}

/**
 * Forwards an authenticated alert rule delete to FastAPI.
 *
 * @param request Incoming same-origin request containing HTTP-only session cookies.
 * @param context Dynamic project and rule route parameters.
 * @returns Proxied response; FastAPI 404s a rule not owned by this project.
 */
export function DELETE(request: NextRequest, context: AlertRuleRouteContext) {
  return forwardAlertRule(request, context);
}
