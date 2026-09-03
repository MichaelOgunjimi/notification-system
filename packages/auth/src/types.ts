/**
 * Authenticated application user details returned by the backend session API.
 *
 * @property id Stable application user identifier.
 * @property email Primary account email address.
 * @property name Display name for the account.
 * @property avatarUrl User-selected or provider-seeded profile image URL.
 * @property isActive Whether the user is currently active.
 * @property emailVerifiedAt ISO timestamp for email verification, if available.
 * @property createdAt ISO timestamp for account creation.
 */
export type User = Readonly<{
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  isActive: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
}>;

/**
 * User-owned profile fields accepted by the profile update endpoint.
 *
 * @property name New display name after trimming, when supplied.
 * @property avatarUrl Absolute HTTP(S) avatar URL, or null to remove the avatar.
 */
export type UpdateProfileInput = Readonly<{
  name?: string;
  avatarUrl?: string | null;
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
export type MagicLinkRequest = Readonly<{
  email: string;
  /** Same-origin relative path to return to after the link is verified. */
  next?: string;
}>;

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
 * External identity linked to the authenticated application user.
 *
 * @property provider Stable provider key.
 * @property providerEmail Email reported by the provider, when available.
 * @property providerName Display name reported by the provider, when available.
 * @property providerUsername Provider-specific username, when available.
 * @property avatarUrl Provider profile image URL, when available.
 * @property connectedAt ISO timestamp for the original connection.
 */
export type OAuthConnection = Readonly<{
  provider: OAuthProvider;
  providerEmail: string | null;
  providerName: string | null;
  providerUsername: string | null;
  avatarUrl: string | null;
  connectedAt: string;
}>;

/**
 * One email identity attached to the authenticated user.
 *
 * @property isPrimary Whether this is the account's canonical login/contact address.
 * @property verifiedAt ISO timestamp once control of the address is confirmed, else null.
 */
export type EmailAddress = Readonly<{
  id: string;
  email: string;
  isPrimary: boolean;
  verifiedAt: string | null;
  createdAt: string;
}>;

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
   * Updates user-owned profile fields without changing login identity.
   *
   * @param input Partial display name and avatar changes.
   * @returns Updated authenticated user record.
   */
  updateProfile(input: UpdateProfileInput): Promise<User>;

  /**
   * Lists external identities linked to the authenticated account.
   *
   * @returns Connected OAuth provider records.
   */
  getOAuthConnections(): Promise<OAuthConnection[]>;

  /**
   * Disconnects one external identity from the authenticated account.
   *
   * @param provider Provider to disconnect.
   */
  disconnectOAuth(provider: OAuthProvider): Promise<void>;

  /**
   * Lists the email addresses attached to the authenticated account.
   *
   * @returns Email records, primary first.
   */
  listEmailAddresses(): Promise<EmailAddress[]>;

  /**
   * Adds an email address and sends its verification link.
   *
   * @param email Address to add; normalized server-side.
   * @returns The new, still-unverified record.
   */
  addEmailAddress(email: string): Promise<EmailAddress>;

  /**
   * Resends the verification email for one pending address.
   *
   * @param emailId Identifier of the address to re-verify.
   */
  resendEmailVerification(emailId: string): Promise<void>;

  /**
   * Promotes one verified address to the account's primary.
   *
   * @param emailId Identifier of the verified address to promote.
   * @returns The updated record.
   */
  setPrimaryEmailAddress(emailId: string): Promise<EmailAddress>;

  /**
   * Removes one non-primary address from the account.
   *
   * @param emailId Identifier of the address to remove.
   */
  removeEmailAddress(emailId: string): Promise<void>;

  /**
   * Confirms an address from the token in its verification email.
   *
   * @param token One-time token from the emailed link.
   * @returns The now-verified record.
   */
  verifyEmailAddress(token: string): Promise<EmailAddress>;

  /**
   * Signs the current user out and clears the active session.
   */
  signOut(): Promise<void>;

  /**
   * Builds the provider login URL for the app auth route.
   *
   * @param provider OAuth provider to sign in with.
   * @param options Optional same-origin `next` return path to resume after sign-in.
   * @returns Relative or absolute app route used to initiate OAuth.
   */
  getOAuthSignInUrl(provider: OAuthProvider, options?: { next?: string }): string;

  /**
   * Builds the authenticated provider connection URL for the app auth route.
   *
   * @param provider OAuth provider to connect.
   * @param options Optional same-origin `next` return path to resume after connecting.
   * @returns App route that begins an authenticated provider connection.
   */
  getOAuthConnectUrl(provider: OAuthProvider, options?: { next?: string }): string;
}
