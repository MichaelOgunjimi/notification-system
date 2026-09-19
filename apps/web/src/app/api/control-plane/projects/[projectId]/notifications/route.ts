import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type ProjectNotificationsRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

/**
 * Forwards an authenticated, filtered project delivery stream to FastAPI.
 *
 * @param request Same-origin request whose query string is forwarded unchanged.
 * @param context Dynamic project identifier.
 * @returns The backend response after cookie-backed session forwarding.
 */
export async function GET(request: NextRequest, context: ProjectNotificationsRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/notifications${request.nextUrl.search}`,
  );
}
