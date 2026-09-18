import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type ProjectAlertRulesRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

/**
 * Forwards an authenticated paginated list of a project's own alert rules to FastAPI.
 *
 * @param request Incoming same-origin request; its page query string is forwarded.
 * @param context Dynamic project route parameters.
 * @returns Proxied paginated alert rule response after backend authorization.
 */
export async function GET(request: NextRequest, context: ProjectAlertRulesRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/alert-rules${request.nextUrl.search}`,
  );
}

/**
 * Forwards an authenticated alert rule creation, scoped to the project, to FastAPI.
 *
 * @param request Incoming request whose JSON body is forwarded unchanged.
 * @param context Dynamic project route parameters.
 * @returns Proxied response; FastAPI enforces the project:deliveries:manage capability.
 */
export async function POST(request: NextRequest, context: ProjectAlertRulesRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(request, `/projects/${projectId}/alert-rules`);
}
