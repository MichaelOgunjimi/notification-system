import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("beacon_token", "", { path: "/", maxAge: 0 });
  response.cookies.set("beacon_session", "", { path: "/", maxAge: 0 });
  return response;
}
