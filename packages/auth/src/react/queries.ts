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
  emailAddresses: ["auth", "email-addresses"] as const,
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
  addEmailAddress: ["auth", "email-addresses", "add"] as const,
  resendEmailVerification: ["auth", "email-addresses", "resend"] as const,
  setPrimaryEmailAddress: ["auth", "email-addresses", "primary"] as const,
  removeEmailAddress: ["auth", "email-addresses", "remove"] as const,
  verifyEmailAddress: ["auth", "email-addresses", "verify"] as const,
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

/**
 * Builds the cached query for the authenticated user's email addresses.
 *
 * @param client Auth client used to load email records.
 * @returns TanStack Query options for the email-address list.
 */
export function emailAddressesQuery(client: AuthClient) {
  return queryOptions({
    queryKey: authQueryKeys.emailAddresses,
    queryFn: () => client.listEmailAddresses(),
    staleTime: 30 * 1000,
  });
}
