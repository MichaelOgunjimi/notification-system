import { type NextRequest } from "next/server";
import { disconnectOAuth, getOAuthConnections } from "./connections";
import { exchangeOAuth, logout, startOAuth, startOAuthConnection } from "./oauth";
import { requestMagicLink, verifyMagicLink } from "./magic-link";
import { forwardAuthenticated, forwardPublic, getSession, updateProfile } from "./session";
import type { NextAuthAdapter, NextAuthAdapterOptions, NextAuthRequestContext } from "./types";

function createRequestContext(options: NextAuthAdapterOptions): NextAuthRequestContext {
  return {
    appAuthPath: (options.appAuthPath ?? "/api/auth").replace(/\/$/, ""),
    refreshCookiePath: (options.refreshCookiePath ?? "/api").replace(/\/$/, ""),
    backendApiUrl: options.backendApiUrl.replace(/\/$/, ""),
    publicBackendApiUrl: options.publicBackendApiUrl.replace(/\/$/, ""),
    fetcher: options.fetch ?? globalThis.fetch.bind(globalThis),
  };
}

/**
 * Creates the server-only Next.js adapter that owns session cookies and proxies
 * authenticated identity requests to the backend.
 *
 * @param options Internal and public backend locations plus optional fetch transport.
 * @returns Route-handler methods for sign-in, session, profile, and authenticated proxy flows.
 * @throws Nothing directly; individual handlers return HTTP error responses from their boundary.
 * @security Access and refresh tokens remain inside HTTP-only cookies and server-side requests.
 */
export function createNextAuthAdapter(options: NextAuthAdapterOptions): NextAuthAdapter {
  const context = createRequestContext(options);

  return {
    connections(request) {
      return getOAuthConnections(context, request);
    },
    disconnectOAuth(request, provider) {
      return disconnectOAuth(context, request, provider);
    },
    exchangeOAuth(request) {
      return exchangeOAuth(context, request);
    },
    logout(request) {
      return logout(context, request);
    },
    requestMagicLink(request) {
      return requestMagicLink(context, request);
    },
    forwardAuthenticated(request, backendPath) {
      return forwardAuthenticated(context, request, backendPath);
    },
    forwardPublic(request, backendPath) {
      return forwardPublic(context, request, backendPath);
    },
    verifyMagicLink(request) {
      return verifyMagicLink(context, request);
    },
    startOAuth(provider) {
      return startOAuth(context, provider);
    },
    startOAuthConnection(provider) {
      return startOAuthConnection(context, provider);
    },
    session(request) {
      return getSession(context, request);
    },
    updateProfile(request) {
      return updateProfile(context, request);
    },
  };
}
