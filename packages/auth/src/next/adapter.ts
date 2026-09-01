import { type NextRequest } from "next/server";
import { exchangeOAuth, logout, startOAuth } from "./oauth";
import { requestMagicLink, verifyMagicLink } from "./magic-link";
import { forwardAuthenticated, getSession } from "./session";
import type { NextAuthAdapter, NextAuthAdapterOptions, NextAuthRequestContext } from "./types";

function createRequestContext(options: NextAuthAdapterOptions): NextAuthRequestContext {
  return {
    appAuthPath: (options.appAuthPath ?? "/api/auth").replace(/\/$/, ""),
    backendApiUrl: options.backendApiUrl.replace(/\/$/, ""),
    publicBackendApiUrl: options.publicBackendApiUrl.replace(/\/$/, ""),
    fetcher: options.fetch ?? globalThis.fetch.bind(globalThis),
  };
}

export function createNextAuthAdapter(options: NextAuthAdapterOptions): NextAuthAdapter {
  const context = createRequestContext(options);

  return {
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
    verifyMagicLink(request) {
      return verifyMagicLink(context, request);
    },
    startOAuth(provider) {
      return startOAuth(context, provider);
    },
    session(request) {
      return getSession(context, request);
    },
  };
}
