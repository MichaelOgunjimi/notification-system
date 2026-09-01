import { NextResponse, type NextRequest } from "next/server";
import type { BackendTokenSet } from "./types";

/**
 * Name of the HTTP-only cookie used to store the signed access token.
 */
export const ACCESS_COOKIE = "beaco_access_token";

/**
 * Name of the HTTP-only cookie used to store the refresh token.
 */
export const REFRESH_COOKIE = "beaco_refresh_token";

/**
 * Shared cookie security settings applied to all session cookies.
 */
export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  priority: "high" as const,
};

/**
 * Detects whether the active request is using HTTPS and therefore should emit secure cookies.
 *
 * @param request Incoming Next.js request.
 * @returns True when secure cookies are allowed for the request.
 */
export function isSecureRequest(request: NextRequest): boolean {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwardedProtocol ? forwardedProtocol === "https" : request.nextUrl.protocol === "https:";
}

/**
 * Writes the access and refresh tokens to the response cookies.
 *
 * @param response Response object being returned to the browser.
 * @param tokens Token pair returned from the backend auth service.
 * @param secure Whether the cookie should be marked secure.
 * @param refreshCookiePath Path scope for the refresh token cookie.
 */
export function writeSessionCookies(
  response: NextResponse,
  tokens: BackendTokenSet,
  secure: boolean,
  refreshCookiePath: string,
): void {
  response.cookies.set(ACCESS_COOKIE, tokens.access_token, {
    ...cookieOptions,
    maxAge: 60 * 15,
    path: "/",
    secure,
  });
  response.cookies.set(REFRESH_COOKIE, tokens.refresh_token, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30,
    path: refreshCookiePath,
    secure,
  });
}

/**
 * Clears the active session cookies from the browser.
 *
 * @param response Response object being returned to the browser.
 * @param secure Whether the cookie should be marked secure.
 * @param refreshCookiePath Path scope for the refresh token cookie.
 */
export function deleteSessionCookies(
  response: NextResponse,
  secure: boolean,
  refreshCookiePath: string,
): void {
  response.cookies.set(ACCESS_COOKIE, "", {
    ...cookieOptions,
    maxAge: 0,
    path: "/",
    secure,
  });
  response.cookies.set(REFRESH_COOKIE, "", {
    ...cookieOptions,
    maxAge: 0,
    path: refreshCookiePath,
    secure,
  });
}
