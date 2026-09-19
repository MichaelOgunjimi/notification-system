import { type NextRequest } from "next/server";
import type { OAuthProvider } from "@beaco/auth";
import { beacoAuth } from "@/lib/auth/next";

type ConnectionRouteContext = Readonly<{
  params: Promise<{ provider: string }>;
}>;

/**
 * Disconnects one supported OAuth provider from the current user.
 *
 * @param request Same-origin request carrying HTTP-only session cookies.
 * @param context Dynamic provider route parameters.
 * @returns Empty success response or a validation/authentication error.
 */
export async function DELETE(
  request: NextRequest,
  context: ConnectionRouteContext,
): Promise<Response> {
  const { provider } = await context.params;
  if (provider !== "github") {
    return Response.json({ detail: "Unsupported OAuth provider." }, { status: 404 });
  }
  return beacoAuth.disconnectOAuth(request, provider satisfies OAuthProvider);
}
