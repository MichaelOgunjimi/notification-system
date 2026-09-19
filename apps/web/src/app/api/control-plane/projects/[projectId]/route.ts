import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type ProjectRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

async function forwardProject(request: NextRequest, context: ProjectRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(request, `/projects/${projectId}`);
}

/**
 * Forwards an authenticated project update (name, slug, description) to FastAPI.
 *
 * @param request Incoming request whose JSON body is forwarded unchanged.
 * @param context Dynamic project route parameters.
 * @returns Proxied response; FastAPI enforces `project:manage` and slug uniqueness.
 */
export function PATCH(request: NextRequest, context: ProjectRouteContext) {
  return forwardProject(request, context);
}

/**
 * Forwards an authenticated project archive request to FastAPI.
 *
 * @param request Incoming same-origin request containing HTTP-only session cookies.
 * @param context Dynamic project route parameters.
 * @returns Proxied response; the project is removed from active listings.
 */
export function DELETE(request: NextRequest, context: ProjectRouteContext) {
  return forwardProject(request, context);
}
