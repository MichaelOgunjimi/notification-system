import { queryOptions } from "@tanstack/react-query";
import { AuthError } from "../error";
import type { AuthClient } from "../types";

/**
 * Shared React Query keys for the auth domain.
 */
export const authQueryKeys = {
  all: ["auth"] as const,
  session: ["auth", "session"] as const,
  connections: ["auth", "connections"] as const,
};

/**
 * Mutation keys for the auth actions supported by the app.
 */
export const authMutationKeys = {
  sendMagicLink: ["auth", "magic-link", "send"] as const,
  verifyMagicLink: ["auth", "magic-link", "verify"] as const,
  completeOAuthSignIn: ["auth", "oauth", "complete"] as const,
  updateProfile: ["auth", "profile", "update"] as const,
  disconnectOAuth: ["auth", "oauth", "disconnect"] as const,
  signOut: ["auth", "sign-out"] as const,
};

/**
 * Builds the cached session query for the current user.
 *
 * @param client Auth client used to read the current session.
 * @returns TanStack Query options for the authenticated session.
 */
export function sessionQuery(client: AuthClient) {
  return queryOptions({
    queryKey: authQueryKeys.session,
    queryFn: () => client.getCurrentUser(),
    retry: (failureCount, error) =>
      error instanceof AuthError && error.retryable && failureCount < 2,
    retryDelay: (attempt) => Math.min(400 * 2 ** attempt, 2_000),
    staleTime: 30 * 1000,
  });
}

/**
 * Builds the cached query for the authenticated user's linked providers.
 *
 * @param client Auth client used to load provider connections.
 * @returns TanStack Query options for OAuth connection state.
 */
export function oauthConnectionsQuery(client: AuthClient) {
  return queryOptions({
    queryKey: authQueryKeys.connections,
    queryFn: () => client.getOAuthConnections(),
    staleTime: 30 * 1000,
  });
}
