import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse } from "@/lib/control-plane-route";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

type RouteContext = Readonly<{ params: Promise<{ token: string }> }>;

/**
 * Forwards an unauthenticated invitation preview to FastAPI.
 *
 * The invitation token is itself the bearer credential, so no session is
 * required — a logged-out invitee needs the organization name before signing
 * in. The token shape is validated before it reaches the backend path.
 *
 * @param request Incoming same-origin request.
 * @param context Dynamic route parameters carrying the raw token.
 * @returns The proxied preview, or a structured error.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  if (!TOKEN_PATTERN.test(token)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardPublic(request, `/invitations/${token}`);
}
