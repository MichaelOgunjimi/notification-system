"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthError } from "../error";
import { useAuthClient } from "./provider";
import {
  authMutationKeys,
  authQueryKeys,
  emailAddressesQuery,
  oauthConnectionsQuery,
  sessionQuery,
} from "./queries";
import type {
  EmailAddress,
  Session,
  SessionStatus,
  MagicLinkReceipt,
  MagicLinkRequest,
  MagicLinkVerification,
  OAuthCodeExchange,
  OAuthProvider,
  UpdateProfileInput,
  User,
} from "../types";

/**
 * Reads the current authenticated session and exposes it in the app state shape.
 * Cached user data remains authenticated during a failed background refresh.
 *
 * @returns Session metadata with status, error state, and a refetch helper.
 */
export function useSession() {
  const client = useAuthClient();
  const query = useQuery(sessionQuery(client));
  const user = query.data ?? null;
  const status: SessionStatus = query.isPending
    ? "loading"
    : user
      ? "authenticated"
      : query.isError
        ? "error"
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
 * Updates the signed-in user's profile and synchronizes the session cache.
 *
 * @returns Mutation hook for changing the display name or avatar URL.
 */
export function useUpdateProfile() {
  const client = useAuthClient();
  const queryClient = useQueryClient();
  return useMutation<User, AuthError, UpdateProfileInput>({
    mutationKey: authMutationKeys.updateProfile,
    mutationFn: (input) => client.updateProfile(input),
    onSuccess: (user) => queryClient.setQueryData(authQueryKeys.session, user),
  });
}

/**
 * Loads OAuth providers connected to the authenticated account.
 *
 * @returns Query hook containing provider connection state.
 */
export function useOAuthConnections() {
  const client = useAuthClient();
  return useQuery(oauthConnectionsQuery(client));
}

/**
 * Disconnects one OAuth provider and refreshes the connection cache.
 *
 * @returns Mutation hook for removing a linked provider identity.
 */
export function useDisconnectOAuth() {
  const client = useAuthClient();
  const queryClient = useQueryClient();
  return useMutation<void, AuthError, OAuthProvider>({
    mutationKey: authMutationKeys.disconnectOAuth,
    mutationFn: (provider) => client.disconnectOAuth(provider),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.connections });
    },
  });
}

/**
 * Loads the authenticated account's email addresses.
 *
 * @returns Query hook containing the email-address list.
 */
export function useEmailAddresses() {
  const client = useAuthClient();
  return useQuery(emailAddressesQuery(client));
}

function useEmailAddressMutation<TArgs, TResult>(
  mutationKey: readonly unknown[],
  mutationFn: (client: ReturnType<typeof useAuthClient>, args: TArgs) => Promise<TResult>,
) {
  const client = useAuthClient();
  const queryClient = useQueryClient();
  return useMutation<TResult, AuthError, TArgs>({
    mutationKey: [...mutationKey],
    mutationFn: (args) => mutationFn(client, args),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.emailAddresses });
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.session });
    },
  });
}

/**
 * Adds an email address and refreshes the email-address list.
 *
 * @returns Mutation hook accepting the address string.
 */
export function useAddEmailAddress() {
  return useEmailAddressMutation<string, EmailAddress>(
    authMutationKeys.addEmailAddress,
    (client, email) => client.addEmailAddress(email),
  );
}

/**
 * Resends the verification email for one pending address.
 *
 * @returns Mutation hook accepting the address id.
 */
export function useResendEmailVerification() {
  return useEmailAddressMutation<string, void>(
    authMutationKeys.resendEmailVerification,
    (client, emailId) => client.resendEmailVerification(emailId),
  );
}

/**
 * Promotes one verified address to primary and refreshes account caches.
 *
 * @returns Mutation hook accepting the address id.
 */
export function useSetPrimaryEmailAddress() {
  return useEmailAddressMutation<string, EmailAddress>(
    authMutationKeys.setPrimaryEmailAddress,
    (client, emailId) => client.setPrimaryEmailAddress(emailId),
  );
}

/**
 * Removes one non-primary address and refreshes the email-address list.
 *
 * @returns Mutation hook accepting the address id.
 */
export function useRemoveEmailAddress() {
  return useEmailAddressMutation<string, void>(
    authMutationKeys.removeEmailAddress,
    (client, emailId) => client.removeEmailAddress(emailId),
  );
}

/**
 * Confirms an email address from the token in its verification link.
 *
 * @returns Mutation hook accepting the one-time token.
 */
export function useVerifyEmailAddress() {
  const client = useAuthClient();
  const queryClient = useQueryClient();
  return useMutation<EmailAddress, AuthError, string>({
    mutationKey: [...authMutationKeys.verifyEmailAddress],
    mutationFn: (token) => client.verifyEmailAddress(token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.emailAddresses });
    },
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
