import { queryOptions } from "@tanstack/react-query";
import { AuthError } from "../error";
import type { AuthClient } from "../types";

/**
 * Shared React Query keys for the auth domain.
 */
export const authQueryKeys = {
  all: ["auth"] as const,
  session: ["auth", "session"] as const,
};

/**
 * Mutation keys for the auth actions supported by the app.
 */
export const authMutationKeys = {
  sendMagicLink: ["auth", "magic-link", "send"] as const,
  verifyMagicLink: ["auth", "magic-link", "verify"] as const,
  completeOAuthSignIn: ["auth", "oauth", "complete"] as const,
  updateProfile: ["auth", "profile", "update"] as const,
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
      error instanceof AuthError && error.retryable && failureCount < 1,
    staleTime: 30 * 1000,
  });
}
