import { NextResponse, type NextRequest } from "next/server";
import type { User } from "../types";
import {
  ACCESS_COOKIE,
  deleteSessionCookies,
  isSecureRequest,
  readRefreshTokenCandidates,
  writeSessionCookies,
} from "./cookies";
import type { BackendTokenSet, BackendUser, NextAuthRequestContext } from "./types";

/**
 * Refreshes the current session using the stored refresh token.
 *
 * @param context Shared request context for the app and backend.
 * @param refreshToken Refresh token stored in the browser cookie.
 * @returns New access/refresh token pair or null when refresh fails.
 * @throws Error when the backend cannot determine token validity because it is unavailable.
 */
export async function refreshSession(
  context: NextAuthRequestContext,
  refreshToken: string,
): Promise<BackendTokenSet | null> {
  const response = await context.fetcher(`${context.backendApiUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });
  if (response.ok) return (await response.json()) as BackendTokenSet;
  if (response.status === 401) return null;
  throw new Error(`Backend session refresh failed with status ${response.status}.`);
}

/**
 * Fetches the authenticated user profile from the backend using the access token.
 *
 * @param context Shared request context for the app and backend.
 * @param accessToken Bearer token attached to the authenticated request.
 * @returns Public user record or null when not authenticated.
 * @throws Error when the backend cannot determine authentication because it is unavailable.
 */
export async function fetchUser(
  context: NextAuthRequestContext,
  accessToken: string,
): Promise<User | null> {
  const response = await context.fetcher(`${context.backendApiUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`Backend user request failed with status ${response.status}.`);
  }
  return toUser((await response.json()) as BackendUser);
}

/**
 * Normalizes a backend user payload into the public auth client contract.
 *
 * @param user User payload returned by the backend.
 * @returns Public user model used by the app.
 */
export function toUser(user: BackendUser): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar_url,
    isActive: user.is_active,
    emailVerifiedAt: user.email_verified_at,
    createdAt: user.created_at,
  };
}

/**
 * Updates the current user's backend profile through the authenticated proxy.
 *
 * @param context Shared request context for the app and backend.
 * @param request Incoming Next.js request containing profile changes.
 * @returns Normalized public user payload or the upstream error response.
 */
export async function updateProfile(
  context: NextAuthRequestContext,
  request: NextRequest,
): Promise<Response> {
  const response = await forwardAuthenticated(context, request, "/auth/me");
  if (!response.ok) return response;
  const user = toUser((await response.json()) as BackendUser);
  const normalizedResponse = NextResponse.json(user, {
    status: response.status,
    headers: response.headers,
  });
  normalizedResponse.headers.set("Cache-Control", "private, no-store");
  return normalizedResponse;
}

/**
 * Reads the current authenticated session from cookies or refresh tokens.
 *
 * @param context Shared request context for the app and backend.
 * @param request Incoming Next.js request.
 * @returns JSON user payload, a confirmed 401, or a retryable 502 without clearing cookies.
 */
export async function getSession(
  context: NextAuthRequestContext,
  request: NextRequest,
): Promise<Response> {
  try {
    const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
    const refreshTokens = readRefreshTokenCandidates(request);

    if (accessToken) {
      const user = await fetchUser(context, accessToken);
      if (user) return NextResponse.json(user);
    }

    for (const refreshToken of refreshTokens) {
      const tokens = await refreshSession(context, refreshToken);
      if (tokens) {
        const user = await fetchUser(context, tokens.access_token);
        if (user) {
          const response = NextResponse.json(user);
          writeSessionCookies(
            response,
            tokens,
            isSecureRequest(request),
            context.refreshCookiePath,
          );
          return response;
        }
      }
    }

    const response = NextResponse.json({ detail: "Not authenticated." }, { status: 401 });
    deleteSessionCookies(response, isSecureRequest(request), context.refreshCookiePath);
    return response;
  } catch {
    return NextResponse.json(
      { detail: "The session service is temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

/**
 * Forwards an authenticated backend request while refreshing expired tokens when needed.
 *
 * @param context Shared request context for the app and backend.
 * @param request Incoming Next.js request.
 * @param backendPath Backend path relative to the API root.
 * @returns Response from the backend with authenticated headers and cookie refresh logic.
 */
export async function forwardAuthenticated(
  context: NextAuthRequestContext,
  request: NextRequest,
  backendPath: string,
): Promise<Response> {
  if (!backendPath.startsWith("/") || backendPath.includes("://")) {
    return NextResponse.json({ detail: "Invalid backend path." }, { status: 500 });
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshTokens = readRefreshTokenCandidates(request);
  const requestBody =
    request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();

  const callBackend = (token: string) =>
    context.fetcher(`${context.backendApiUrl}${backendPath}`, {
      method: request.method,
      headers: {
        Accept: request.headers.get("accept") ?? "application/json",
        Authorization: `Bearer ${token}`,
        ...(requestBody
          ? {
              "Content-Type": request.headers.get("content-type") ?? "application/json",
            }
          : {}),
      },
      body: requestBody,
      cache: "no-store",
      redirect: "manual",
    });

  try {
    let tokens: BackendTokenSet | null = null;
    let refreshRejected = false;
    let upstream = accessToken ? await callBackend(accessToken) : null;

    if ((!upstream || upstream.status === 401) && refreshTokens.length > 0) {
      for (const refreshToken of refreshTokens) {
        tokens = await refreshSession(context, refreshToken);
        if (tokens) break;
      }
      refreshRejected = tokens === null;
      upstream = tokens ? await callBackend(tokens.access_token) : null;
    }

    if (!upstream) {
      const response = NextResponse.json({ detail: "Not authenticated." }, { status: 401 });
      // Only clear the session when a refresh token was actually presented and
      // rejected. If no refresh token reached this route (wrong cookie path,
      // a not-yet-established session), a 401 means "cannot refresh from here",
      // not "session is dead" — /api/auth/session still recovers it.
      if (refreshRejected) {
        deleteSessionCookies(response, isSecureRequest(request), context.refreshCookiePath);
      }
      return response;
    }

    const responseHeaders: Record<string, string> = {
      "Cache-Control": "private, no-store",
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    };
    const location = upstream.headers.get("location");
    if (location) responseHeaders.Location = location;

    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
    if (tokens) {
      writeSessionCookies(response, tokens, isSecureRequest(request), context.refreshCookiePath);
    }
    // A bare 401 here means the access token was rejected and no refresh token
    // was available to retry with: leave the session cookies alone (see above).
    // A presented-but-rejected refresh token already returned via `!upstream`.
    return response;
  } catch {
    return NextResponse.json(
      { detail: "The application service is unavailable." },
      { status: 502 },
    );
  }
}

/**
 * Forwards a backend request that needs no session.
 *
 * Same transport and path guard as {@link forwardAuthenticated}, but it never
 * reads a cookie, attaches no `Authorization` header, and passes the backend's
 * status through unchanged (including 401/404). Use it only for endpoints the
 * backend itself leaves unauthenticated, such as a token-keyed invitation
 * preview a logged-out invitee must see.
 *
 * @param context Shared request context for the app and backend.
 * @param request Incoming Next.js request.
 * @param backendPath Backend path relative to the API root.
 * @returns The backend response, streamed through the same-origin boundary.
 */
export async function forwardPublic(
  context: NextAuthRequestContext,
  request: NextRequest,
  backendPath: string,
): Promise<Response> {
  if (!backendPath.startsWith("/") || backendPath.includes("://")) {
    return NextResponse.json({ detail: "Invalid backend path." }, { status: 500 });
  }

  const requestBody =
    request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();

  try {
    const upstream = await context.fetcher(`${context.backendApiUrl}${backendPath}`, {
      method: request.method,
      headers: {
        Accept: request.headers.get("accept") ?? "application/json",
        ...(requestBody
          ? { "Content-Type": request.headers.get("content-type") ?? "application/json" }
          : {}),
      },
      body: requestBody,
      cache: "no-store",
      redirect: "manual",
    });

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "The application service is unavailable." },
      { status: 502 },
    );
  }
}
