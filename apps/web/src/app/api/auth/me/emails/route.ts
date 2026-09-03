import { type NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";

/**
 * Lists the current session's email addresses, camel-cased.
 *
 * @param request Same-origin request carrying HTTP-only session cookies.
 */
export function GET(request: NextRequest): Promise<Response> {
  return beacoAuth.listEmailAddresses(request);
}

/**
 * Adds an email address and triggers its verification email.
 *
 * @param request Same-origin request whose JSON body carries the address.
 */
export function POST(request: NextRequest): Promise<Response> {
  return beacoAuth.addEmailAddress(request);
}
