import { NextResponse } from "next/server";
import type { AuthTokens } from "@/lib/auth/contracts";
import { authenticateTokens, setSessionCookies } from "@/lib/auth/server";

export async function POST(request: Request): Promise<Response> {
  const tokens = (await request.json().catch(() => null)) as AuthTokens | null;
  if (!tokens?.access_token || !tokens.refresh_token || tokens.token_type !== "bearer") {
    return NextResponse.json({ detail: "Invalid OAuth session payload." }, { status: 400 });
  }

  const user = await authenticateTokens(tokens);
  if (!user) return NextResponse.json({ detail: "The OAuth session is invalid." }, { status: 401 });

  const response = NextResponse.json(user);
  setSessionCookies(response, tokens);
  return response;
}
