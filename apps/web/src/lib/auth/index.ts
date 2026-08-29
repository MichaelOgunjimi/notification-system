export {
  authClient,
  BeacoAuthClient,
  BeacoAuthError,
  establishOAuthSession,
  getSession,
  githubLoginUrl,
  requestMagicLink,
  signOut,
  verifyMagicLink,
} from "./client";
export { AuthContext, BeacoAuthProvider, type AuthContextValue } from "./provider";
export { useBeacoAuth, useBeacoUser } from "./hooks";
export type {
  ApiError,
  AuthChangeCallback,
  AuthChangeEvent,
  AuthClientOptions,
  AuthMessage,
  AuthSession,
  AuthTokens,
  AuthUser,
} from "./contracts";
