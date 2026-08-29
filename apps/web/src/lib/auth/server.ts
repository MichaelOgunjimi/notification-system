import "server-only";

import { NextResponse } from "next/server";
import type { AuthTokens, AuthUser } from "./contracts";

export const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
export const ACCESS_COOKIE = "beaco_access_token";
export const REFRESH_COOKIE = "beaco_refresh_token";
export const SESSION_COOKIE = "beaco_session";

const secure = process.env.NODE_ENV === "production";

export function setSessionCookies(response: NextResponse, tokens: AuthTokens): void {
  response.cookies.set(ACCESS_COOKIE, tokens.access_token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 15,
    secure,
  });
  response.cookies.set(REFRESH_COOKIE, tokens.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure,
  });
  response.cookies.set(SESSION_COOKIE, "1", {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure,
  });
}

export function clearSessionCookies(response: NextResponse): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, SESSION_COOKIE]) {
    response.cookies.set(name, "", { path: "/", maxAge: 0, secure });
  }
  response.cookies.set("beaco_token", "", { path: "/", maxAge: 0, secure });
}

export async function getBackendUser(accessToken: string): Promise<Response> {
  return fetch(`${BACKEND_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
}

export async function refreshTokens(refreshToken: string): Promise<AuthTokens | null> {
  const response = await fetch(`${BACKEND_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as AuthTokens;
}

export async function authenticateTokens(tokens: AuthTokens): Promise<AuthUser | null> {
  const response = await getBackendUser(tokens.access_token);
  if (!response.ok) return null;
  return (await response.json()) as AuthUser;
}
