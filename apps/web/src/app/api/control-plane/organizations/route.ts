import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";

/**
 * Forwards the authenticated user's organization list to FastAPI.
 *
 * @param request Incoming same-origin request; its include_archived query string is forwarded.
 * @returns Proxied organization list with refresh-cookie handling.
 */
export function GET(request: NextRequest) {
  return beacoAuth.forwardAuthenticated(request, `/organizations${request.nextUrl.search}`);
}

/**
 * Forwards an authenticated organization creation to FastAPI. The backend makes
 * the caller an owner and seeds a default project.
 *
 * @param request Incoming request whose JSON body is forwarded unchanged.
 * @returns Proxied organization response after slug validation.
 */
export function POST(request: NextRequest) {
  return beacoAuth.forwardAuthenticated(request, "/organizations");
}
