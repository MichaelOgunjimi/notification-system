import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BACKEND_API_URL, deleteSessionCookies, isSecureRequest, REFRESH_COOKIE } from "@/lib/auth/server";

export async function POST(request: Request) {
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    await fetch(`${BACKEND_API_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    }).catch(() => undefined);
  }
  const response = NextResponse.json({ ok: true });
  deleteSessionCookies(response, isSecureRequest(request));
  return response;
}
