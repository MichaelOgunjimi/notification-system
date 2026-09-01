/**
 * Authenticated application user details returned by the backend session API.
 *
 * @property id Stable application user identifier.
 * @property email Primary account email address.
 * @property name Display name for the account.
 * @property isActive Whether the user is currently active.
 * @property emailVerifiedAt ISO timestamp for email verification, if available.
 * @property createdAt ISO timestamp for account creation.
 */
export type User = Readonly<{
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
}>;

/**
 * Current session state as exposed to the client application.
 *
 * @property user Authenticated user, or null when not signed in.
 * @property isAuthenticated Whether the session is active and usable.
 */
export type Session = Readonly<{
  user: User | null;
  isAuthenticated: boolean;
}>;

/**
 * Loading state for the client-side session lifecycle.
 */
export type SessionStatus = "loading" | "authenticated" | "anonymous" | "error";

/**
 * Request payload for sending a passwordless magic-link sign-in email.
 *
 * @property email Email address to send the sign-in link to.
 */
export type MagicLinkRequest = Readonly<{ email: string }>;

/**
 * Successful response returned after submitting a magic-link request.
 *
 * @property message Human-readable status message from the backend.
 */
export type MagicLinkReceipt = Readonly<{ message: string }>;

/**
 * Payload used to complete a magic-link sign-in flow.
 *
 * @property token One-time verification token embedded in the link.
 */
export type MagicLinkVerification = Readonly<{ token: string }>;

/**
 * Supported OAuth providers for the auth package.
 */
export type OAuthProvider = "github";

/**
 * OAuth code exchange payload returned from the frontend callback.
 *
 * @property code Authorization code issued by the provider.
 */
export type OAuthCodeExchange = Readonly<{ code: string }>;

/**
 * Client configuration used to route auth calls through the application API.
 *
 * @property appAuthPath Same-origin route prefix that serves the auth handlers.
 * @property fetch Optional fetch implementation used for tests and custom transports.
 */
export type AuthClientOptions = Readonly<{
  /** Same-origin path served by the Next.js authentication route handlers. */
  appAuthPath?: string;
  /** Injectable fetch implementation for tests and non-browser adapters. */
  fetch?: typeof globalThis.fetch;
}>;

/**
 * Public contract for the browser-facing auth client.
 */
export interface AuthClient {
  /**
   * Requests a sign-in magic link for a user email.
   *
   * @param request Email request payload.
   * @returns Backend receipt for the outbound message.
   */
  sendMagicLink(request: MagicLinkRequest): Promise<MagicLinkReceipt>;

  /**
   * Verifies a magic-link token and resolves the authenticated user.
   *
   * @param request Verification payload with the signed token.
   * @returns Authenticated user record.
   */
  verifyMagicLink(request: MagicLinkVerification): Promise<User>;

  /**
   * Completes an OAuth code exchange and resolves the user session.
   *
   * @param exchange OAuth callback code payload.
   * @returns Authenticated user record.
   */
  completeOAuthSignIn(exchange: OAuthCodeExchange): Promise<User>;

  /**
   * Loads the currently authenticated user from the backend if one exists.
   *
   * @returns Current user or null when no session is active.
   */
  getCurrentUser(): Promise<User | null>;

  /**
   * Signs the current user out and clears the active session.
   */
  signOut(): Promise<void>;

  /**
   * Builds the provider login URL for the app auth route.
   *
   * @param provider OAuth provider to sign in with.
   * @returns Relative or absolute app route used to initiate OAuth.
   */
  getOAuthSignInUrl(provider: OAuthProvider): string;
}
