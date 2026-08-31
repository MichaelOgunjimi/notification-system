import { NextResponse } from "next/server";
import {
  authenticateTokenSet,
  BACKEND_API_URL,
  isSecureRequest,
  toSessionTokenSet,
  writeSessionCookies,
} from "@/lib/auth/server";

export async function POST(request: Request): Promise<Response> {
  const payload = (await request.json().catch(() => null)) as { code?: string } | null;
  if (!payload?.code) {
    return NextResponse.json({ detail: "Missing OAuth authorization code." }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${BACKEND_API_URL}/auth/oauth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: payload.code }),
      cache: "no-store",
    });
    if (!upstream.ok) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
      });
    }

    const tokens = toSessionTokenSet(await upstream.json());
    const user = await authenticateTokenSet(tokens);
    if (!user) return NextResponse.json({ detail: "Unable to create a session." }, { status: 502 });

    const response = NextResponse.json(user);
    writeSessionCookies(response, tokens, isSecureRequest(request));
    return response;
  } catch {
    return NextResponse.json({ detail: "The sign-in service is unavailable." }, { status: 502 });
  }
}
