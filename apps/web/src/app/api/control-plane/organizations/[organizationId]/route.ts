import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type OrganizationRouteContext = Readonly<{
  params: Promise<{ organizationId: string }>;
}>;

async function forwardOrganization(request: NextRequest, context: OrganizationRouteContext) {
  const { organizationId } = await context.params;
  if (!isControlPlaneId(organizationId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(request, `/organizations/${organizationId}`);
}

/**
 * Forwards an authenticated organization read to FastAPI.
 *
 * @param request Incoming same-origin request containing HTTP-only session cookies.
 * @param context Dynamic organization route parameters.
 * @returns Proxied backend response with refresh-cookie handling.
 */
export function GET(request: NextRequest, context: OrganizationRouteContext) {
  return forwardOrganization(request, context);
}

/**
 * Forwards an authenticated organization update to FastAPI.
 *
 * @param request Incoming request whose JSON body is forwarded unchanged.
 * @param context Dynamic organization route parameters.
 * @returns Proxied backend response; FastAPI enforces organization capabilities.
 */
export function PATCH(request: NextRequest, context: OrganizationRouteContext) {
  return forwardOrganization(request, context);
}

/**
 * Forwards an authenticated organization archive request to FastAPI.
 *
 * @param request Incoming same-origin request containing HTTP-only session cookies.
 * @param context Dynamic organization route parameters.
 * @returns Proxied backend response; FastAPI enforces owner-only deletion capability.
 */
export function DELETE(request: NextRequest, context: OrganizationRouteContext) {
  return forwardOrganization(request, context);
}
