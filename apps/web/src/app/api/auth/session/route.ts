import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  clearSessionCookies,
  getBackendUser,
  REFRESH_COOKIE,
  refreshTokens,
  setSessionCookies,
} from "@/lib/auth/server";

export async function GET(): Promise<Response> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  if (accessToken) {
    const upstream = await getBackendUser(accessToken);
    if (upstream.ok) {
      return new Response(upstream.body, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (refreshToken) {
    const tokens = await refreshTokens(refreshToken);
    if (tokens) {
      const upstream = await getBackendUser(tokens.access_token);
      if (upstream.ok) {
        const user = await upstream.json();
        const response = NextResponse.json(user);
        setSessionCookies(response, tokens);
        return response;
      }
    }
  }

  const response = NextResponse.json({ detail: "Not authenticated." }, { status: 401 });
  clearSessionCookies(response);
  return response;
}
