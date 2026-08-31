import { authErrorFromResponse, authNetworkError } from "./error";
import type {
  AuthClient,
  AuthClientOptions,
  MagicLinkReceipt,
  MagicLinkRequest,
  MagicLinkVerification,
  OAuthCodeExchange,
  OAuthProvider,
  User,
} from "./types";

const DEFAULT_AUTH_API_PATH = "/api/auth";

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw await authErrorFromResponse(response, fallback);
  return (await response.json()) as T;
}

class HttpAuthClient implements AuthClient {
  private readonly apiPath: string;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: AuthClientOptions = {}) {
    this.apiPath = (options.apiPath ?? DEFAULT_AUTH_API_PATH).replace(/\/$/, "");
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async sendMagicLink({ email }: MagicLinkRequest): Promise<MagicLinkReceipt> {
    return this.request<MagicLinkReceipt>(
      "/magic-link/request",
      { method: "POST", body: JSON.stringify({ email: email.trim().toLowerCase() }) },
      "We could not send the sign-in link.",
    );
  }

  async verifyMagicLink({ token }: MagicLinkVerification): Promise<User> {
    return this.request<User>(
      "/magic-link/verify",
      { method: "POST", body: JSON.stringify({ token }) },
      "This sign-in link could not be verified.",
    );
  }

  async completeOAuthSignIn(exchange: OAuthCodeExchange): Promise<User> {
    return this.request<User>(
      "/oauth/exchange",
      { method: "POST", body: JSON.stringify(exchange) },
      "GitHub sign-in could not be completed.",
    );
  }

  async getCurrentUser(): Promise<User | null> {
    const response = await this.fetch("/session", { method: "GET" });
    if (response.status === 401) return null;
    return readJson<User>(response, "We could not load the current session.");
  }

  async signOut(): Promise<void> {
    const response = await this.fetch("/logout", { method: "POST" });
    if (!response.ok) throw await authErrorFromResponse(response, "We could not sign you out.");
  }

  getOAuthSignInUrl(provider: OAuthProvider): string {
    return `${this.apiPath}/oauth/${provider}`;
  }

  private async request<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
    const response = await this.fetch(path, init);
    return readJson<T>(response, fallback);
  }

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(`${this.apiPath}${path}`, {
        ...init,
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      throw authNetworkError(error);
    }
  }
}

export function createAuthClient(options: AuthClientOptions = {}): AuthClient {
  return new HttpAuthClient(options);
}

export const authClient = createAuthClient();
