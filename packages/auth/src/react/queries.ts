import { queryOptions } from "@tanstack/react-query";
import { AuthError } from "../error";
import type { AuthClient } from "../types";

export const authQueryKeys = {
  all: ["auth"] as const,
  session: ["auth", "session"] as const,
};

export const authMutationKeys = {
  sendMagicLink: ["auth", "magic-link", "send"] as const,
  verifyMagicLink: ["auth", "magic-link", "verify"] as const,
  completeOAuthSignIn: ["auth", "oauth", "complete"] as const,
  signOut: ["auth", "sign-out"] as const,
};

export function sessionQuery(client: AuthClient) {
  return queryOptions({
    queryKey: authQueryKeys.session,
    queryFn: () => client.getCurrentUser(),
    retry: (failureCount, error) =>
      error instanceof AuthError && error.retryable && failureCount < 1,
    staleTime: 30 * 1000,
  });
}
