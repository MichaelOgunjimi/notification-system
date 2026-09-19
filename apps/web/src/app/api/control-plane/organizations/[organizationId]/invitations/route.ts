import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type InvitationsRouteContext = Readonly<{
  params: Promise<{ organizationId: string }>;
}>;

async function forwardInvitations(request: NextRequest, context: InvitationsRouteContext) {
  const { organizationId } = await context.params;
  if (!isControlPlaneId(organizationId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(request, `/organizations/${organizationId}/invitations`);
}

/**
 * Forwards an authenticated invitation listing to FastAPI.
 *
 * @param request Incoming same-origin request containing HTTP-only session cookies.
 * @param context Dynamic organization route parameters.
 * @returns Proxied invitation history after member-management authorization.
 */
export function GET(request: NextRequest, context: InvitationsRouteContext) {
  return forwardInvitations(request, context);
}

/**
 * Forwards an authenticated invitation creation to FastAPI.
 *
 * @param request Incoming request whose JSON body is forwarded unchanged.
 * @param context Dynamic organization route parameters.
 * @returns Proxied invitation response; FastAPI owns validation and email delivery.
 */
export function POST(request: NextRequest, context: InvitationsRouteContext) {
  return forwardInvitations(request, context);
}
