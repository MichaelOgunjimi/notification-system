import { NextResponse, type NextRequest } from "next/server";
import type { User } from "../types";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  deleteSessionCookies,
  isSecureRequest,
  writeSessionCookies,
} from "./cookies";
import type { BackendTokenSet, BackendUser, NextAuthRequestContext } from "./types";

/**
 * Refreshes the current session using the stored refresh token.
 *
 * @param context Shared request context for the app and backend.
 * @param refreshToken Refresh token stored in the browser cookie.
 * @returns New access/refresh token pair or null when refresh fails.
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
  return response.ok ? ((await response.json()) as BackendTokenSet) : null;
}

/**
 * Fetches the authenticated user profile from the backend using the access token.
 *
 * @param context Shared request context for the app and backend.
 * @param accessToken Bearer token attached to the authenticated request.
 * @returns Public user record or null when not authenticated.
 */
export async function fetchUser(
  context: NextAuthRequestContext,
  accessToken: string,
): Promise<User | null> {
  const response = await context.fetcher(`${context.backendApiUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
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
    isActive: user.is_active,
    emailVerifiedAt: user.email_verified_at,
    createdAt: user.created_at,
  };
}

/**
 * Reads the current authenticated session from cookies or refresh tokens.
 *
 * @param context Shared request context for the app and backend.
 * @param request Incoming Next.js request.
 * @returns JSON user payload when authenticated, otherwise a 401 response.
 */
export async function getSession(
  context: NextAuthRequestContext,
  request: NextRequest,
): Promise<Response> {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (accessToken) {
    const user = await fetchUser(context, accessToken);
    if (user) return NextResponse.json(user);
  }

  if (refreshToken) {
    const tokens = await refreshSession(context, refreshToken);
    if (tokens) {
      const user = await fetchUser(context, tokens.access_token);
      if (user) {
        const response = NextResponse.json(user);
        writeSessionCookies(response, tokens, isSecureRequest(request), context.appAuthPath);
        return response;
      }
    }
  }

  const response = NextResponse.json({ detail: "Not authenticated." }, { status: 401 });
  deleteSessionCookies(response, isSecureRequest(request), context.appAuthPath);
  return response;
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
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const requestBody = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : await request.arrayBuffer();

  const callBackend = (token: string) => context.fetcher(`${context.backendApiUrl}${backendPath}`, {
    method: request.method,
    headers: {
      Accept: request.headers.get("accept") ?? "application/json",
      Authorization: `Bearer ${token}`,
      ...(requestBody
        ? { "Content-Type": request.headers.get("content-type") ?? "application/json" }
        : {}),
    },
    body: requestBody,
    cache: "no-store",
  });

  try {
    let tokens: BackendTokenSet | null = null;
    let upstream = accessToken ? await callBackend(accessToken) : null;

    if ((!upstream || upstream.status === 401) && refreshToken) {
      tokens = await refreshSession(context, refreshToken);
      upstream = tokens ? await callBackend(tokens.access_token) : null;
    }

    if (!upstream) {
      const response = NextResponse.json(
        { detail: "Not authenticated." },
        { status: 401 },
      );
      deleteSessionCookies(response, isSecureRequest(request), context.appAuthPath);
      return response;
    }

    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
    if (tokens) {
      writeSessionCookies(response, tokens, isSecureRequest(request), context.appAuthPath);
    } else if (upstream.status === 401) {
      deleteSessionCookies(response, isSecureRequest(request), context.appAuthPath);
    }
    return response;
  } catch {
    return NextResponse.json(
      { detail: "The application service is unavailable." },
      { status: 502 },
    );
  }
}
