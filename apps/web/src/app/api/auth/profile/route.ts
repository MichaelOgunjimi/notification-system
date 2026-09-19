import { type NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";

/**
 * Proxies profile updates through the server-managed authentication session.
 *
 * @param request Same-origin PATCH request containing user-owned profile fields.
 * @returns Updated public user data or the backend validation response.
 */
export function PATCH(request: NextRequest): Promise<Response> {
  return beacoAuth.updateProfile(request);
}
