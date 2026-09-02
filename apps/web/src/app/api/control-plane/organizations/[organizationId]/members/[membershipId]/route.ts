import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type MemberRouteContext = Readonly<{
  params: Promise<{ organizationId: string; membershipId: string }>;
}>;

async function forwardMember(request: NextRequest, context: MemberRouteContext) {
  const { organizationId, membershipId } = await context.params;
  if (!isControlPlaneId(organizationId) || !isControlPlaneId(membershipId)) {
    return invalidControlPlaneIdResponse();
  }
  return beacoAuth.forwardAuthenticated(
    request,
    `/organizations/${organizationId}/members/${membershipId}`,
  );
}

/**
 * Forwards an authenticated membership-role update to FastAPI.
 *
 * @param request Incoming request whose JSON body is forwarded unchanged.
 * @param context Dynamic organization and membership route parameters.
 * @returns Proxied response; FastAPI enforces member-management and owner rules.
 */
export function PATCH(request: NextRequest, context: MemberRouteContext) {
  return forwardMember(request, context);
}

/**
 * Forwards an authenticated membership removal to FastAPI.
 *
 * @param request Incoming same-origin request containing HTTP-only session cookies.
 * @param context Dynamic organization and membership route parameters.
 * @returns Proxied response; FastAPI prevents removal of the final owner.
 */
export function DELETE(request: NextRequest, context: MemberRouteContext) {
  return forwardMember(request, context);
}
