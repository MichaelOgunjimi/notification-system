import { type NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";

/**
 * Confirms an email address from the token in its verification link.
 * Unauthenticated — the emailed token is the proof of control.
 *
 * @param request Same-origin request whose JSON body carries the token.
 */
export function POST(request: NextRequest): Promise<Response> {
  return beacoAuth.verifyEmailAddress(request);
}
