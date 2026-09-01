import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  deleteSessionCookies,
  isSecureRequest,
  writeSessionCookies,
} from "./cookies";
import type { BackendTokenSet, NextAuthRequestContext } from "./types";
import { fetchUser } from "./session";

/**
 * Creates an OAuth redirect handler for a specific provider.
 *
 * @param context Shared request context with the public backend base URL.
 * @param provider OAuth provider to redirect the browser to.
 * @returns Route handler that issues the outbound redirect.
 */
export function startOAuth(
  context: NextAuthRequestContext,
  provider: "github",
): (request: NextRequest) => Response {
  return () => NextResponse.redirect(`${context.publicBackendApiUrl}/oauth/${provider}/login`, 307);
}

/**
 * Exchanges a provider callback code for a backend-backed session.
 *
 * @param context Shared request context for the app and backend.
 * @param request Incoming Next.js request containing the callback payload.
 * @returns User payload with HTTP-only session cookies set.
 */
export async function exchangeOAuth(
  context: NextAuthRequestContext,
  request: NextRequest,
): Promise<Response> {
  try {
    const upstream = await context.fetcher(`${context.backendApiUrl}/auth/oauth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
      cache: "no-store",
    });
    if (!upstream.ok) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        },
      });
    }

    const tokens = (await upstream.json()) as BackendTokenSet;
    const user = await fetchUser(context, tokens.access_token);
    if (!user) {
      return NextResponse.json({ detail: "Unable to create a session." }, { status: 502 });
    }

    const response = NextResponse.json(user);
    writeSessionCookies(response, tokens, isSecureRequest(request), context.appAuthPath);
    return response;
  } catch {
    return NextResponse.json({ detail: "The sign-in service is unavailable." }, { status: 502 });
  }
}

/**
 * Signs the current user out and clears both session cookies.
 *
 * @param context Shared request context for the app and backend.
 * @param request Incoming Next.js request containing the active refresh token.
 * @returns Confirmation response after session cleanup.
 */
export async function logout(
  context: NextAuthRequestContext,
  request: NextRequest,
): Promise<Response> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    await context
      .fetcher(`${context.backendApiUrl}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      })
      .catch(() => undefined);
  }
  const response = NextResponse.json({ ok: true });
  deleteSessionCookies(response, isSecureRequest(request), context.appAuthPath);
  return response;
}

/**
 * Loads the user from the access token cookie without triggering a refresh flow.
 *
 * @param context Shared request context for the app and backend.
 * @param request Incoming Next.js request.
 * @returns User payload when a valid access token exists, otherwise null.
 */
export async function sessionFromAccessToken(
  context: NextAuthRequestContext,
  request: NextRequest,
): Promise<Response | null> {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return null;

  const user = await fetchUser(context, accessToken);
  return user ? NextResponse.json(user) : null;
}
