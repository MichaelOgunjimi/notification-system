import { NextResponse, type NextRequest } from "next/server";
import { isSecureRequest, writeSessionCookies } from "./cookies";
import { fetchUser } from "./session";
import type { BackendTokenSet, NextAuthRequestContext } from "./types";

/**
 * Submits a magic-link request to the backend authentication API.
 *
 * @param context Shared request context for the app and backend.
 * @param request Incoming Next.js request with the email payload.
 * @returns Backend response for the magic-link request.
 */
export async function requestMagicLink(
  context: NextAuthRequestContext,
  request: NextRequest,
): Promise<Response> {
  try {
    const upstream = await context.fetcher(`${context.backendApiUrl}/auth/magic-link/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json({ detail: "The sign-in service is unavailable." }, { status: 502 });
  }
}

/**
 * Exchanges a magic-link verification payload for authenticated session cookies.
 *
 * @param context Shared request context for the app and backend.
 * @param request Incoming Next.js request carrying the verification payload.
 * @param backendPath Backend auth endpoint path.
 * @returns User payload and cookies when verification succeeds.
 */
export async function exchangeForSession(
  context: NextAuthRequestContext,
  request: NextRequest,
  backendPath: string,
): Promise<Response> {
  try {
    const upstream = await context.fetcher(`${context.backendApiUrl}${backendPath}`, {
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
    writeSessionCookies(response, tokens, isSecureRequest(request), context.refreshCookiePath);
    return response;
  } catch {
    return NextResponse.json({ detail: "The sign-in service is unavailable." }, { status: 502 });
  }
}

/**
 * Verifies a magic-link token and creates a user session.
 *
 * @param context Shared request context for the app and backend.
 * @param request Incoming Next.js request containing the signed token.
 * @returns Authenticated user payload with session cookies.
 */
export function verifyMagicLink(
  context: NextAuthRequestContext,
  request: NextRequest,
): Promise<Response> {
  return exchangeForSession(context, request, "/auth/magic-link/verify");
}
