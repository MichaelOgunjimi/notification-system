import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type ProjectTemplatesRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

/**
 * Forwards an authenticated paginated list of a project's own templates to FastAPI.
 *
 * @param request Incoming same-origin request; its page/channel query string is forwarded.
 * @param context Dynamic project route parameters.
 * @returns Proxied paginated template response after backend authorization.
 */
export async function GET(request: NextRequest, context: ProjectTemplatesRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/templates${request.nextUrl.search}`,
  );
}

/**
 * Forwards an authenticated template creation, scoped to the project, to FastAPI.
 *
 * @param request Incoming request whose JSON body is forwarded unchanged.
 * @param context Dynamic project route parameters.
 * @returns Proxied response; FastAPI enforces the project:manage capability.
 */
export async function POST(request: NextRequest, context: ProjectTemplatesRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(request, `/projects/${projectId}/templates`);
}
