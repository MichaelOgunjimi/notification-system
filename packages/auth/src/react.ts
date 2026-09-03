export {
  useSession,
  useAddEmailAddress,
  useCompleteOAuthSignIn,
  useDisconnectOAuth,
  useEmailAddresses,
  useOAuthConnections,
  useRemoveEmailAddress,
  useResendEmailVerification,
  useSendMagicLink,
  useSetPrimaryEmailAddress,
  useSignOut,
  useUpdateProfile,
  useVerifyEmailAddress,
  useVerifyMagicLink,
} from "./react/hooks";
export { AuthProvider, createAuthQueryClient, useAuthClient } from "./react/provider";
export {
  authMutationKeys,
  authQueryKeys,
  emailAddressesQuery,
  oauthConnectionsQuery,
  sessionQuery,
} from "./react/queries";
