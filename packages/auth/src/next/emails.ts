import { NextResponse, type NextRequest } from "next/server";
import type { EmailAddress } from "../types";
import { forwardAuthenticated, forwardPublic } from "./session";
import type { BackendEmailAddress, NextAuthRequestContext } from "./types";

function toEmailAddress(row: BackendEmailAddress): EmailAddress {
  return {
    id: row.id,
    email: row.email,
    isPrimary: row.is_primary,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
  };
}

function isSafeId(value: string): boolean {
  return /^[a-zA-Z0-9-]{1,64}$/.test(value);
}

async function remapJson(
  response: Response,
  map: (payload: unknown) => unknown,
): Promise<Response> {
  if (!response.ok) return response;
  const payload = await response.json();
  // Preserve the upstream status (e.g. 201) and the refreshed session cookies
  // written by forwardAuthenticated.
  return NextResponse.json(map(payload), {
    status: response.status,
    headers: response.headers,
  });
}

/**
 * Lists the authenticated user's email addresses through the cookie boundary.
 *
 * @param context Shared Next.js auth request context.
 * @param request Incoming same-origin request carrying session cookies.
 * @returns Camel-cased email records or the upstream error.
 */
export async function listEmailAddresses(
  context: NextAuthRequestContext,
  request: NextRequest,
): Promise<Response> {
  const response = await forwardAuthenticated(context, request, "/auth/me/emails");
  return remapJson(response, (payload) => (payload as BackendEmailAddress[]).map(toEmailAddress));
}

/**
 * Adds an email address and triggers verification.
 *
 * @param context Shared Next.js auth request context.
 * @param request Incoming same-origin request whose JSON body carries the email.
 * @returns The new (unverified) camel-cased record or the upstream error.
 */
export async function addEmailAddress(
  context: NextAuthRequestContext,
  request: NextRequest,
): Promise<Response> {
  const response = await forwardAuthenticated(context, request, "/auth/me/emails");
  return remapJson(response, (payload) => toEmailAddress(payload as BackendEmailAddress));
}

/**
 * Resends the verification email for one pending address.
 *
 * @param context Shared Next.js auth request context.
 * @param request Incoming same-origin request carrying session cookies.
 * @param emailId Address identifier from the route segment.
 * @returns The upstream acknowledgement, or 400 for a malformed id.
 */
export function resendEmailVerification(
  context: NextAuthRequestContext,
  request: NextRequest,
  emailId: string,
): Promise<Response> {
  if (!isSafeId(emailId)) {
    return Promise.resolve(NextResponse.json({ detail: "Invalid resource ID." }, { status: 400 }));
  }
  return forwardAuthenticated(context, request, `/auth/me/emails/${emailId}/resend`);
}

/**
 * Promotes one verified address to primary.
 *
 * @param context Shared Next.js auth request context.
 * @param request Incoming same-origin request carrying session cookies.
 * @param emailId Address identifier from the route segment.
 * @returns The updated camel-cased record, or 400 for a malformed id.
 */
export async function setPrimaryEmailAddress(
  context: NextAuthRequestContext,
  request: NextRequest,
  emailId: string,
): Promise<Response> {
  if (!isSafeId(emailId)) {
    return NextResponse.json({ detail: "Invalid resource ID." }, { status: 400 });
  }
  const response = await forwardAuthenticated(
    context,
    request,
    `/auth/me/emails/${emailId}/primary`,
  );
  return remapJson(response, (payload) => toEmailAddress(payload as BackendEmailAddress));
}

/**
 * Removes one non-primary address.
 *
 * @param context Shared Next.js auth request context.
 * @param request Incoming same-origin request carrying session cookies.
 * @param emailId Address identifier from the route segment.
 * @returns The upstream result, or 400 for a malformed id.
 */
export function removeEmailAddress(
  context: NextAuthRequestContext,
  request: NextRequest,
  emailId: string,
): Promise<Response> {
  if (!isSafeId(emailId)) {
    return Promise.resolve(NextResponse.json({ detail: "Invalid resource ID." }, { status: 400 }));
  }
  return forwardAuthenticated(context, request, `/auth/me/emails/${emailId}`);
}

/**
 * Confirms an address from its emailed token. No session is required — holding
 * the token is the proof of control.
 *
 * @param context Shared Next.js auth request context.
 * @param request Incoming same-origin request whose JSON body carries the token.
 * @returns The verified camel-cased record or the upstream error.
 */
export async function verifyEmailAddress(
  context: NextAuthRequestContext,
  request: NextRequest,
): Promise<Response> {
  const response = await forwardPublic(context, request, "/auth/emails/verify");
  return remapJson(response, (payload) => toEmailAddress(payload as BackendEmailAddress));
}
