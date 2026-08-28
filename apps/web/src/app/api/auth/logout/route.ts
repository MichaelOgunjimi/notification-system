import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("beaco_token", "", { path: "/", maxAge: 0 });
  response.cookies.set("beaco_session", "", { path: "/", maxAge: 0 });
  return response;
}
