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
  const session: Session = { user, isAuthenticated: status === "authenticated" };

  return {
    ...session,
    status,
    error: query.error,
    isFetching: query.isFetching,
    refresh: query.refetch,
  };
}

export function useSendMagicLink() {
  const client = useAuthClient();
  return useMutation<MagicLinkReceipt, AuthError, MagicLinkRequest>({
    mutationKey: authMutationKeys.sendMagicLink,
    mutationFn: (request) => client.sendMagicLink(request),
  });
}

export function useVerifyMagicLink() {
  const client = useAuthClient();
  const queryClient = useQueryClient();
  return useMutation<User, AuthError, MagicLinkVerification>({
    mutationKey: authMutationKeys.verifyMagicLink,
    mutationFn: (request) => client.verifyMagicLink(request),
    onSuccess: (user) => queryClient.setQueryData(authQueryKeys.session, user),
  });
}

export function useCompleteOAuthSignIn() {
  const client = useAuthClient();
  const queryClient = useQueryClient();
  return useMutation<User, AuthError, OAuthCodeExchange>({
    mutationKey: authMutationKeys.completeOAuthSignIn,
    mutationFn: (exchange) => client.completeOAuthSignIn(exchange),
    onSuccess: (user) => queryClient.setQueryData(authQueryKeys.session, user),
  });
}

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
