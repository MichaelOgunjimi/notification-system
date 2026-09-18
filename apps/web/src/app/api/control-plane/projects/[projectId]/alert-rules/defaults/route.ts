import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type ProjectAlertRuleDefaultsRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

/**
 * Forwards an authenticated paginated list of the org-wide default alert
 * rules shared with this project to FastAPI.
 *
 * @param request Incoming same-origin request; its page query string is forwarded.
 * @param context Dynamic project route parameters.
 * @returns Proxied paginated alert rule response after backend authorization.
 */
export async function GET(request: NextRequest, context: ProjectAlertRuleDefaultsRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/alert-rules/defaults${request.nextUrl.search}`,
  );
}
