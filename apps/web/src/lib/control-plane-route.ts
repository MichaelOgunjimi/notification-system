import { NextResponse } from "next/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates an untrusted route segment before including it in a backend path.
 *
 * @param value Dynamic route segment supplied by Next.js.
 * @returns Whether the segment is a canonical UUID-shaped identifier.
 */
export function isControlPlaneId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Creates the stable validation response returned for malformed control-plane IDs.
 *
 * @returns HTTP 400 JSON response safe to return from a route handler.
 */
export function invalidControlPlaneIdResponse(): NextResponse {
  return NextResponse.json({ detail: "Invalid resource ID." }, { status: 400 });
}
