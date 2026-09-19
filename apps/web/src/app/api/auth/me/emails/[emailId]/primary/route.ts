import { type NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";

type Ctx = Readonly<{ params: Promise<{ emailId: string }> }>;

/**
 * Promotes one verified address to the account's primary.
 *
 * @param request Same-origin request carrying HTTP-only session cookies.
 * @param context Dynamic route parameters carrying the address id.
 */
export async function POST(request: NextRequest, context: Ctx): Promise<Response> {
  const { emailId } = await context.params;
  return beacoAuth.setPrimaryEmailAddress(request, emailId);
}
