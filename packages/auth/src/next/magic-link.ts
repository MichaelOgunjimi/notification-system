import { NextResponse, type NextRequest } from "next/server";
import {
  isSecureRequest,
  writeSessionCookies,
} from "./cookies";
import { fetchUser } from "./session";
import type { BackendTokenSet, NextAuthRequestContext } from "./types";

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
    return NextResponse.json(
      { detail: "The sign-in service is unavailable." },
      { status: 502 },
    );
  }
}

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
      return NextResponse.json(
        { detail: "Unable to create a session." },
        { status: 502 },
      );
    }

    const response = NextResponse.json(user);
    writeSessionCookies(response, tokens, isSecureRequest(request), context.appAuthPath);
    return response;
  } catch {
    return NextResponse.json(
      { detail: "The sign-in service is unavailable." },
      { status: 502 },
    );
  }
}

export function verifyMagicLink(
  context: NextAuthRequestContext,
  request: NextRequest,
): Promise<Response> {
  return exchangeForSession(context, request, "/auth/magic-link/verify");
}
