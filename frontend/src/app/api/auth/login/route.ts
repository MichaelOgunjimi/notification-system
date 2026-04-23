import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export async function POST(request: Request) {
  let apiKey = "";

  try {
    const body = (await request.json()) as { apiKey?: string };
    apiKey = body.apiKey?.trim() ?? "";
  } catch {
    return NextResponse.json({ detail: "Invalid request body" }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ detail: "API key is required" }, { status: 400 });
  }

  try {
    const upstreamResponse = await fetch(`${API_URL}/api/v1/auth/validate`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
      },
    });

    const data = await upstreamResponse.json();
    const response = NextResponse.json(data, { status: upstreamResponse.status });

    if (upstreamResponse.ok) {
      const secure = process.env.NODE_ENV === "production";

      response.cookies.set("beacon_token", apiKey, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE,
        secure,
      });

      response.cookies.set("beacon_session", "1", {
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE,
        secure,
      });
    }

    return response;
  } catch {
    return NextResponse.json({ detail: "Upstream service unavailable" }, { status: 502 });
  }
}
