import { NextResponse, type NextRequest } from "next/server";
import type { OAuthConnection, OAuthProvider } from "../types";
import { forwardAuthenticated } from "./session";
import type { BackendOAuthConnection, NextAuthRequestContext } from "./types";

function toOAuthConnection(connection: BackendOAuthConnection): OAuthConnection {
  return {
    provider: connection.provider,
    providerEmail: connection.provider_email,
    providerName: connection.provider_name,
    providerUsername: connection.provider_username,
    avatarUrl: connection.avatar_url,
    connectedAt: connection.created_at,
  };
}

/**
 * Lists and normalizes the current user's OAuth connections.
 *
 * @param context Shared Next.js auth request context.
 * @param request Incoming same-origin request carrying session cookies.
 * @returns Browser-safe provider connection records or the upstream error.
 */
export async function getOAuthConnections(
  context: NextAuthRequestContext,
  request: NextRequest,
): Promise<Response> {
  const response = await forwardAuthenticated(context, request, "/auth/me/connections");
  if (!response.ok) return response;

  const connections = (await response.json()) as BackendOAuthConnection[];
  return NextResponse.json(connections.map(toOAuthConnection), {
    headers: response.headers,
  });
}

/**
 * Disconnects one OAuth provider for the current authenticated user.
 *
 * @param context Shared Next.js auth request context.
 * @param request Incoming same-origin request carrying session cookies.
 * @param provider Provider identity to remove.
 * @returns Empty success response or the upstream error response.
 */
export function disconnectOAuth(
  context: NextAuthRequestContext,
  request: NextRequest,
  provider: OAuthProvider,
): Promise<Response> {
  return forwardAuthenticated(context, request, `/auth/me/connections/${provider}`);
}
