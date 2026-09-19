import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";

/**
 * Forwards an authenticated invitation acceptance to FastAPI. The backend
 * matches the one-time token against a verified email the caller owns.
 *
 * @param request Incoming request whose JSON `{ token }` body is forwarded unchanged.
 * @returns Proxied 204 response, or the backend's structured error.
 */
export function POST(request: NextRequest) {
  return beacoAuth.forwardAuthenticated(request, "/invitations/accept");
}
