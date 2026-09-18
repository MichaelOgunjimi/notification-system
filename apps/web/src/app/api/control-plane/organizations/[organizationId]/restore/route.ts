import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type OrganizationRestoreRouteContext = Readonly<{
  params: Promise<{ organizationId: string }>;
}>;

/**
 * Forwards an authenticated organization restore to FastAPI.
 *
 * @param request Incoming same-origin request containing HTTP-only session cookies.
 * @param context Dynamic organization route parameters.
 * @returns Proxied response; FastAPI enforces the organization:delete capability.
 */
export async function POST(request: NextRequest, context: OrganizationRestoreRouteContext) {
  const { organizationId } = await context.params;
  if (!isControlPlaneId(organizationId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(request, `/organizations/${organizationId}/restore`);
}
