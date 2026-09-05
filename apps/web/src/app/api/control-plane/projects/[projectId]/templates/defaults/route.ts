import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type ProjectTemplateDefaultsRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

/**
 * Forwards an authenticated paginated list of the shared system default
 * templates to FastAPI (the project id only authorizes the request).
 *
 * @param request Incoming same-origin request; its page/channel query string is forwarded.
 * @param context Dynamic project route parameters.
 * @returns Proxied paginated template response after backend authorization.
 */
export async function GET(request: NextRequest, context: ProjectTemplateDefaultsRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/templates/defaults${request.nextUrl.search}`,
  );
}
