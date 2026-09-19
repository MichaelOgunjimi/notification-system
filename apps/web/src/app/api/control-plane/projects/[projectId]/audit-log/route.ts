import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type AuditLogRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

/**
 * Forwards an authenticated page of a project's activity log to FastAPI.
 *
 * @param request Incoming same-origin request; its page/filter query string is forwarded.
 * @param context Dynamic project route parameters.
 * @returns Proxied paginated audit-log response after backend `project:audit:read` checks.
 */
export async function GET(request: NextRequest, context: AuditLogRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/audit-log${request.nextUrl.search}`,
  );
}
