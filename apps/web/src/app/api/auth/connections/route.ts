import { type NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";

/**
 * Lists OAuth identities linked to the current cookie-backed session.
 *
 * @param request Same-origin request carrying HTTP-only session cookies.
 * @returns Normalized connection records or an authentication error.
 */
export function GET(request: NextRequest): Promise<Response> {
  return beacoAuth.connections(request);
}
