import "server-only";

import { NextResponse } from "next/server";
import type { User } from "@beaco/auth";

type BackendTokenSet = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export type SessionTokenSet = {
  accessToken: string;
  refreshToken: string;
  tokenType: "bearer";
};

type BackendUser = {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  email_verified_at: string | null;
  created_at: string;
};

export const BACKEND_ORIGIN = process.env.BACKEND_URL ?? "http://localhost:8000";
export const BACKEND_API_URL = `${BACKEND_ORIGIN.replace(/\/$/, "")}/api/v1`;
export const PUBLIC_API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"
).replace(/\/$/, "");
export const ACCESS_COOKIE = "beaco_access_token";
export const REFRESH_COOKIE = "beaco_refresh_token";

const sharedCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  priority: "high" as const,
};

export function isSecureRequest(request: Request): boolean {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwardedProtocol ? forwardedProtocol === "https" : new URL(request.url).protocol === "https:";
}

export function writeSessionCookies(
  response: NextResponse,
  tokens: SessionTokenSet,
  secure: boolean,
): void {
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    ...sharedCookieOptions,
    path: "/",
    secure,
    maxAge: 60 * 15,
  });
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...sharedCookieOptions,
    path: "/api/auth",
    secure,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function deleteSessionCookies(response: NextResponse, secure: boolean): void {
  response.cookies.set(ACCESS_COOKIE, "", {
    ...sharedCookieOptions,
    path: "/",
    secure,
    maxAge: 0,
  });
  response.cookies.set(REFRESH_COOKIE, "", {
    ...sharedCookieOptions,
    path: "/api/auth",
    secure,
    maxAge: 0,
  });
  for (const name of ["beaco_session", "beaco_token"]) {
    response.cookies.set(name, "", { ...sharedCookieOptions, path: "/", secure, maxAge: 0 });
  }
}

export function toSessionTokenSet(tokens: BackendTokenSet): SessionTokenSet {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenType: "bearer",
  };
}

function toUser(user: BackendUser): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isActive: user.is_active,
    emailVerifiedAt: user.email_verified_at,
    createdAt: user.created_at,
  };
}

export async function fetchCurrentUser(accessToken: string): Promise<User | null> {
  const response = await fetch(`${BACKEND_API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return toUser((await response.json()) as BackendUser);
}

export async function refreshSession(refreshToken: string): Promise<SessionTokenSet | null> {
  const response = await fetch(`${BACKEND_API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  return toSessionTokenSet((await response.json()) as BackendTokenSet);
}

export async function authenticateTokenSet(tokens: SessionTokenSet): Promise<User | null> {
  return fetchCurrentUser(tokens.accessToken);
}
