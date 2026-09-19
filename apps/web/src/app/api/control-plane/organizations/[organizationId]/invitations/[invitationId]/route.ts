import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

/**
 * Forwards an authenticated invitation revocation to FastAPI.
 *
 * @param request Incoming same-origin request containing HTTP-only session cookies.
 * @param context Dynamic organization and invitation route parameters.
 * @returns Proxied response after backend member-management authorization.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string; invitationId: string }> },
) {
  const { organizationId, invitationId } = await params;
  if (!isControlPlaneId(organizationId) || !isControlPlaneId(invitationId)) {
    return invalidControlPlaneIdResponse();
  }
  return beacoAuth.forwardAuthenticated(
    request,
    `/organizations/${organizationId}/invitations/${invitationId}`,
  );
}
