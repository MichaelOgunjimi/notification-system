import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  deleteSessionCookies,
  fetchCurrentUser,
  isSecureRequest,
  REFRESH_COOKIE,
  refreshSession,
  writeSessionCookies,
} from "@/lib/auth/server";

export async function GET(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  if (accessToken) {
    const user = await fetchCurrentUser(accessToken);
    if (user) return NextResponse.json(user);
  }

  if (refreshToken) {
    const tokens = await refreshSession(refreshToken);
    if (tokens) {
      const user = await fetchCurrentUser(tokens.accessToken);
      if (user) {
        const response = NextResponse.json(user);
        writeSessionCookies(response, tokens, isSecureRequest(request));
        return response;
      }
    }
  }

  const response = NextResponse.json({ detail: "Not authenticated." }, { status: 401 });
  deleteSessionCookies(response, isSecureRequest(request));
  return response;
}
