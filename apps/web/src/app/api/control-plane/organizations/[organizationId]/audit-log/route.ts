import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type AuditLogRouteContext = Readonly<{
  params: Promise<{ organizationId: string }>;
}>;

/**
 * Forwards an authenticated page of an organization-wide activity log to FastAPI.
 *
 * @param request Incoming same-origin request; its page/filter query string is forwarded.
 * @param context Dynamic organization route parameters.
 * @returns Proxied paginated audit-log response after backend `organization:audit:read` checks.
 */
export async function GET(request: NextRequest, context: AuditLogRouteContext) {
  const { organizationId } = await context.params;
  if (!isControlPlaneId(organizationId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/organizations/${organizationId}/audit-log${request.nextUrl.search}`,
  );
}
