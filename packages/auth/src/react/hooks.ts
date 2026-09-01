"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthError } from "../error";
import { useAuthClient } from "./provider";
import { authMutationKeys, authQueryKeys, sessionQuery } from "./queries";
import type {
  Session,
  SessionStatus,
  MagicLinkReceipt,
  MagicLinkRequest,
  MagicLinkVerification,
  OAuthCodeExchange,
  User,
} from "../types";

/**
 * Reads the current authenticated session and exposes it in the app state shape.
 *
 * @returns Session metadata with status, error state, and a refetch helper.
 */
export function useSession() {
  const client = useAuthClient();
  const query = useQuery(sessionQuery(client));
  const user = query.data ?? null;
  const status: SessionStatus = query.isPending
    ? "loading"
    : query.isError
      ? "error"
      : user
        ? "authenticated"
        : "anonymous";
  const session: Session = {
    user,
    isAuthenticated: status === "authenticated",
  };

  return {
    ...session,
    status,
    error: query.error,
    isFetching: query.isFetching,
    refresh: query.refetch,
  };
}

/**
 * Sends a magic-link request from a React component.
 *
 * @returns Mutation hook for requesting a sign-in email.
 */
export function useSendMagicLink() {
  const client = useAuthClient();
  return useMutation<MagicLinkReceipt, AuthError, MagicLinkRequest>({
    mutationKey: authMutationKeys.sendMagicLink,
    mutationFn: (request) => client.sendMagicLink(request),
  });
}

/**
 * Verifies a magic-link token and updates the cached session state.
 *
 * @returns Mutation hook for completing passwordless sign-in.
 */
export function useVerifyMagicLink() {
  const client = useAuthClient();
  const queryClient = useQueryClient();
  return useMutation<User, AuthError, MagicLinkVerification>({
    mutationKey: authMutationKeys.verifyMagicLink,
    mutationFn: (request) => client.verifyMagicLink(request),
    onSuccess: (user) => queryClient.setQueryData(authQueryKeys.session, user),
  });
}

/**
 * Completes an OAuth callback and updates the cached authenticated user.
 *
 * @returns Mutation hook for finishing provider sign-in.
 */
export function useCompleteOAuthSignIn() {
  const client = useAuthClient();
  const queryClient = useQueryClient();
  return useMutation<User, AuthError, OAuthCodeExchange>({
    mutationKey: authMutationKeys.completeOAuthSignIn,
    mutationFn: (exchange) => client.completeOAuthSignIn(exchange),
    onSuccess: (user) => queryClient.setQueryData(authQueryKeys.session, user),
  });
}

/**
 * Signs the current user out and clears the cached auth state.
 *
 * @returns Mutation hook used to end the current session.
 */
export function useSignOut() {
  const client = useAuthClient();
  const queryClient = useQueryClient();
  return useMutation<void, AuthError, void>({
    mutationKey: authMutationKeys.signOut,
    mutationFn: () => client.signOut(),
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: authQueryKeys.all });
      queryClient.setQueryData(authQueryKeys.session, null);
    },
  });
}
