import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BACKEND_URL, clearSessionCookies, REFRESH_COOKIE } from "@/lib/auth/server";

export async function POST() {
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    await fetch(`${BACKEND_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    }).catch(() => undefined);
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}
