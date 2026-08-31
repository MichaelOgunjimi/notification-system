export type User = Readonly<{
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
}>;

export type Session = Readonly<{
  user: User | null;
  isAuthenticated: boolean;
}>;

export type SessionStatus = "loading" | "authenticated" | "anonymous" | "error";

export type MagicLinkRequest = Readonly<{ email: string }>;
export type MagicLinkReceipt = Readonly<{ message: string }>;
export type MagicLinkVerification = Readonly<{ token: string }>;
export type OAuthProvider = "github";

export type OAuthCodeExchange = Readonly<{ code: string }>;

export type AuthClientOptions = Readonly<{
  /** Same-origin path served by the Next.js authentication route handlers. */
  apiPath?: string;
  /** Injectable fetch implementation for tests and non-browser adapters. */
  fetch?: typeof globalThis.fetch;
}>;

export interface AuthClient {
  sendMagicLink(request: MagicLinkRequest): Promise<MagicLinkReceipt>;
  verifyMagicLink(request: MagicLinkVerification): Promise<User>;
  completeOAuthSignIn(exchange: OAuthCodeExchange): Promise<User>;
  getCurrentUser(): Promise<User | null>;
  signOut(): Promise<void>;
  getOAuthSignInUrl(provider: OAuthProvider): string;
}
