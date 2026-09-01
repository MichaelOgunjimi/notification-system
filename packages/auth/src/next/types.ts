import type { NextRequest } from "next/server";
import type { OAuthProvider, User } from "../types";

export type BackendUser = {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  email_verified_at: string | null;
  created_at: string;
};

export type BackendTokenSet = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
};

export type NextAuthAdapterOptions = Readonly<{
  appAuthPath?: string;
  backendApiUrl: string;
  publicBackendApiUrl: string;
  fetch?: typeof globalThis.fetch;
}>;

export type NextAuthAdapter = Readonly<{
  session(request: NextRequest): Promise<Response>;
  startOAuth(provider: OAuthProvider): (request: NextRequest) => Response;
  exchangeOAuth(request: NextRequest): Promise<Response>;
  requestMagicLink(request: NextRequest): Promise<Response>;
  verifyMagicLink(request: NextRequest): Promise<Response>;
  logout(request: NextRequest): Promise<Response>;
  forwardAuthenticated(request: NextRequest, backendPath: string): Promise<Response>;
}>;

export type NextAuthRequestContext = {
  appAuthPath: string;
  backendApiUrl: string;
  publicBackendApiUrl: string;
  fetcher: typeof globalThis.fetch;
};

export type BackendUserResponse = User;
