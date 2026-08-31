import { NextResponse } from "next/server";
import { PUBLIC_API_URL } from "@/lib/auth/server";

export function GET(): NextResponse {
  return NextResponse.redirect(`${PUBLIC_API_URL}/oauth/github/login`, 307);
}
