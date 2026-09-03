import "server-only";
import { NextResponse, type NextRequest } from "next/server";

const backendOrigin = (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

type RouteContext = Readonly<{ params: Promise<{ token: string }> }>;

/**
 * Forwards an unauthenticated invitation preview to FastAPI.
 *
 * The invitation token is itself the bearer credential, so no session is
 * required — a logged-out invitee needs the organization name before signing
 * in. The token shape is validated before it reaches the backend URL.
 *
 * @param _request Incoming same-origin request (no body, no cookies used).
 * @param context Dynamic route parameters carrying the raw token.
 * @returns The proxied preview, or a structured error.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  if (!TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ detail: "Invalid invitation token." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${backendOrigin}/api/v1/invitations/${encodeURIComponent(token)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ detail: "The workspace service is unavailable." }, { status: 503 });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
