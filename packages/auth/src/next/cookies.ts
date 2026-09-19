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
 * Reads every distinct refresh-token cookie presented by the browser in header order.
 *
 * During a cookie-path migration, browsers can send several cookies with the
 * same name. Next.js exposes only one of those duplicates through
 * `request.cookies.get`, so the adapter must retain every candidate and allow
 * the backend to identify the valid session. Values are never returned to the
 * browser or written to logs.
 *
 * @param request Incoming request that may contain current and legacy cookies.
 * @returns Ordered, de-duplicated refresh-token candidates.
 * @security Returned credentials must remain inside server-only auth handlers.
 */
export function readRefreshTokenCandidates(request: NextRequest): string[] {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return [];

  const prefix = `${REFRESH_COOKIE}=`;
  const candidates = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(prefix))
    .map((part) => part.slice(prefix.length))
    .filter(Boolean);

  // One current path plus the two known legacy paths is the largest valid set.
  // The cap prevents a crafted Cookie header from amplifying backend refresh calls.
  return [...new Set(candidates)].slice(0, 3);
}

/**
 * Path scopes the refresh cookie previously used. Browsers that authenticated
 * under an earlier release still hold a `beaco_refresh_token` at one of these
 * paths; because the `Cookie` request header carries no path, a stale duplicate
 * can shadow the current cookie. Expiring these on every session write and clear
 * converges such browsers to a single cookie.
 *
 * Transitional — safe to remove once every refresh token issued before the
 * `/api` migration has aged out (30-day refresh lifetime).
 */
const SUPERSEDED_REFRESH_COOKIE_PATHS = ["/", "/api/auth"];

/**
 * Expires refresh cookies left at a superseded path scope.
 *
 * Appended as raw headers because `response.cookies` is keyed by cookie name
 * alone and would collapse these into the current-scope write. Must run after
 * every `response.cookies.set` on this response.
 *
 * @param response Response object being returned to the browser.
 * @param secure Whether the cookie should be marked secure.
 * @param currentPath Path scope in use now, which is left untouched.
 */
function expireSupersededRefreshCookies(
  response: NextResponse,
  secure: boolean,
  currentPath: string,
): void {
  for (const path of SUPERSEDED_REFRESH_COOKIE_PATHS) {
    if (path === currentPath) continue;
    // Cookie deletion matches on name + domain + path only; the remaining
    // attributes mirror how the cookie was originally written.
    const attributes = [`Path=${path}`, "Max-Age=0", "HttpOnly", "SameSite=lax", "Priority=high"];
    if (secure) attributes.push("Secure");
    response.headers.append("set-cookie", `${REFRESH_COOKIE}=; ${attributes.join("; ")}`);
  }
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
  expireSupersededRefreshCookies(response, secure, refreshCookiePath);
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
  expireSupersededRefreshCookies(response, secure, refreshCookiePath);
}
