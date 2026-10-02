import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type ForkAlertRuleRouteContext = Readonly<{
  params: Promise<{ projectId: string; ruleId: string }>;
}>;

/**
 * Forwards an authenticated request to fork an org-wide default alert rule
 * into a new rule owned by this project. FastAPI never modifies the original.
 *
 * @param request Incoming same-origin request; no body is required.
 * @param context Dynamic project and source-rule route parameters.
 * @returns Proxied response containing the new, independently-editable copy.
 */
export async function POST(request: NextRequest, context: ForkAlertRuleRouteContext) {
  const { projectId, ruleId } = await context.params;
  if (!isControlPlaneId(projectId) || !isControlPlaneId(ruleId)) {
    return invalidControlPlaneIdResponse();
  }
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/alert-rules/${ruleId}/fork`,
  );
}
