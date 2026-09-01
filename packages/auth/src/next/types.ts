import type { NextRequest } from "next/server";
import type { OAuthProvider, User } from "../types";

/**
 * Backend user payload returned from the user session endpoint.
 *
 * @property id Stable backend user identifier.
 * @property email User email address.
 * @property name Display name from the backend.
 * @property avatar_url Application-owned avatar URL or null.
 * @property is_active Whether the backend user account is active.
 * @property email_verified_at Verification timestamp or null.
 * @property created_at Creation timestamp from the backend.
 */
export type BackendUser = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  is_active: boolean;
  email_verified_at: string | null;
  created_at: string;
};

/**
 * Access and refresh token pair issued by the backend authentication service.
 *
 * @property access_token Short-lived access token used for authenticated requests.
 * @property refresh_token Long-lived refresh token used to renew sessions.
 * @property token_type Token type, currently bearer.
 */
export type BackendTokenSet = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
};

/**
 * Configuration used to create the Next.js auth adapter.
 *
 * @property appAuthPath Route prefix that serves the app auth handlers.
 * @property backendApiUrl Internal backend API base URL.
 * @property publicBackendApiUrl Public backend URL used for OAuth redirects.
 * @property fetch Optional fetch implementation for testing or custom transports.
 */
export type NextAuthAdapterOptions = Readonly<{
  appAuthPath?: string;
  backendApiUrl: string;
  publicBackendApiUrl: string;
  fetch?: typeof globalThis.fetch;
}>;

/**
 * Public adapter contract exposed to Next.js route handlers.
 */
export type NextAuthAdapter = Readonly<{
  /**
   * Returns the current authenticated user from the request cookies or refresh token.
   *
   * @param request Incoming Next.js request.
   * @returns Session payload or 401 when the user is anonymous.
   */
  session(request: NextRequest): Promise<Response>;

  /**
   * Forwards a profile update through the authenticated cookie boundary.
   *
   * @param request Incoming Next.js request containing profile changes.
   * @returns Updated public user payload or an upstream validation error.
   */
  updateProfile(request: NextRequest): Promise<Response>;

  /**
   * Creates a route handler that redirects the browser to the backend OAuth login URL.
   *
   * @param provider OAuth provider to begin login with.
   * @returns Route handler that issues the redirect response.
   */
  startOAuth(provider: OAuthProvider): (request: NextRequest) => Response;

  /**
   * Exchanges an OAuth callback payload for a backend-backed session.
   *
   * @param request Incoming Next.js request carrying the provider callback.
   * @returns JSON user payload along with the issued HTTP-only cookies.
   */
  exchangeOAuth(request: NextRequest): Promise<Response>;

  /**
   * Submits a magic-link request to the backend without exposing backend config.
   *
   * @param request Incoming Next.js request containing the email payload.
   * @returns Upstream backend response.
   */
  requestMagicLink(request: NextRequest): Promise<Response>;

  /**
   * Verifies a magic-link token and issues a session.
   *
   * @param request Incoming Next.js request containing the verification payload.
   * @returns JSON user payload plus session cookies.
   */
  verifyMagicLink(request: NextRequest): Promise<Response>;

  /**
   * Clears the current session and invalidates refresh tokens.
   *
   * @param request Incoming Next.js request with the active session cookies.
   * @returns Confirmation response.
   */
  logout(request: NextRequest): Promise<Response>;

  /**
   * Proxies an authenticated backend request while attaching bearer auth.
   *
   * @param request Incoming Next.js request.
   * @param backendPath Backend endpoint path relative to the API root.
   * @returns Upstream response with refreshed credentials when needed.
   */
  forwardAuthenticated(request: NextRequest, backendPath: string): Promise<Response>;
}>;

/**
 * Internal runtime context used by the Next auth adapter.
 *
 * @property appAuthPath Sanitized app auth route prefix.
 * @property backendApiUrl Sanitized internal backend base URL.
 * @property publicBackendApiUrl Sanitized public backend base URL.
 * @property fetcher Fetch implementation used for all auth calls.
 */
export type NextAuthRequestContext = {
  appAuthPath: string;
  backendApiUrl: string;
  publicBackendApiUrl: string;
  fetcher: typeof globalThis.fetch;
};

/**
 * Alias used to normalize the backend user payload into the public auth contract.
 */
export type BackendUserResponse = User;
