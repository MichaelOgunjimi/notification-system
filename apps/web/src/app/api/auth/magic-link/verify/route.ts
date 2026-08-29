import { NextResponse } from "next/server";
import type { AuthTokens } from "@/lib/auth/contracts";
import { authenticateTokens, BACKEND_URL, setSessionCookies } from "@/lib/auth/server";

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  try {
    const upstream = await fetch(`${BACKEND_URL}/api/v1/auth/magic-link/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
    if (!upstream.ok) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
      });
    }

    const tokens = (await upstream.json()) as AuthTokens;
    const user = await authenticateTokens(tokens);
    if (!user) return NextResponse.json({ detail: "Unable to create a session." }, { status: 502 });

    const response = NextResponse.json(user);
    setSessionCookies(response, tokens);
    return response;
  } catch {
    return NextResponse.json({ detail: "The sign-in service is unavailable." }, { status: 502 });
  }
}
