import { NextResponse, type NextRequest } from "next/server";
import type { BackendTokenSet } from "./types";

export const ACCESS_COOKIE = "beaco_access_token";
export const REFRESH_COOKIE = "beaco_refresh_token";

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  priority: "high" as const,
};

export function isSecureRequest(request: NextRequest): boolean {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwardedProtocol
    ? forwardedProtocol === "https"
    : request.nextUrl.protocol === "https:";
}

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
