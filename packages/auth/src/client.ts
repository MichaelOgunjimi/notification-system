import { authErrorFromResponse, authNetworkError } from "./error";
import type {
  AuthClient,
  AuthClientOptions,
  MagicLinkReceipt,
  MagicLinkRequest,
  MagicLinkVerification,
  OAuthCodeExchange,
  OAuthConnection,
  OAuthProvider,
  UpdateProfileInput,
  User,
} from "./types";

const DEFAULT_AUTH_API_PATH = "/api/auth";

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw await authErrorFromResponse(response, fallback);
  return (await response.json()) as T;
}

/**
 * Appends a same-origin `next` return path to an OAuth entry URL.
 *
 * The value is only forwarded; the backend re-validates it before it can
 * influence a redirect. A non-relative path is dropped here as a first guard.
 *
 * @param url Base OAuth URL on the application boundary.
 * @param next Optional relative return path.
 * @returns The URL, with `?next=` appended when the path is a safe relative one.
 */
function withReturnPath(url: string, next?: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("://")) {
    return url;
  }
  return `${url}?next=${encodeURIComponent(next)}`;
}

/**
 * HTTP-backed implementation of the auth client.
 */
class HttpAuthClient implements AuthClient {
  private readonly appAuthPath: string;
  private readonly fetcher: typeof globalThis.fetch;

  /**
   * @param options Client configuration for the auth route and fetch transport.
   */
  constructor(options: AuthClientOptions = {}) {
    this.appAuthPath = (options.appAuthPath ?? DEFAULT_AUTH_API_PATH).replace(/\/$/, "");
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Sends a passwordless sign-in link to a user email.
   *
   * @param request Email request payload.
   * @returns Backend acknowledgement for the email request.
   */
  async sendMagicLink({ email, next }: MagicLinkRequest): Promise<MagicLinkReceipt> {
    const payload: { email: string; next?: string } = { email: email.trim().toLowerCase() };
    if (next) payload.next = next;
    return this.request<MagicLinkReceipt>(
      "/magic-link/request",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      "We could not send the sign-in link.",
    );
  }

  /**
   * Verifies a magic-link token and resolves the authenticated user.
   *
   * @param request Verification payload carrying the token.
   * @returns Authenticated user object.
   */
  async verifyMagicLink({ token }: MagicLinkVerification): Promise<User> {
    return this.request<User>(
      "/magic-link/verify",
      { method: "POST", body: JSON.stringify({ token }) },
      "This sign-in link could not be verified.",
    );
  }

  /**
   * Exchanges an OAuth callback code for a signed-in user.
   *
   * @param exchange OAuth code payload from the redirect callback.
   * @returns Authenticated user object.
   */
  async completeOAuthSignIn(exchange: OAuthCodeExchange): Promise<User> {
    return this.request<User>(
      "/oauth/exchange",
      { method: "POST", body: JSON.stringify(exchange) },
      "GitHub sign-in could not be completed.",
    );
  }

  /**
   * Loads the current authenticated user from the application session endpoint.
   *
   * @returns Current user or null when the session is expired or absent.
   */
  async getCurrentUser(): Promise<User | null> {
    const response = await this.fetch("/session", { method: "GET" });
    if (response.status === 401) return null;
    return readJson<User>(response, "We could not load the current session.");
  }

  /**
   * Updates the authenticated user's display profile.
   *
   * @param input Partial profile values to persist.
   * @returns Updated authenticated user record.
   */
  async updateProfile(input: UpdateProfileInput): Promise<User> {
    return this.request<User>(
      "/profile",
      {
        method: "PATCH",
        body: JSON.stringify({
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.avatarUrl !== undefined ? { avatar_url: input.avatarUrl } : {}),
        }),
      },
      "We could not update your profile.",
    );
  }

  /**
   * Lists OAuth identities linked to the authenticated user.
   *
   * @returns Connected provider records.
   */
  async getOAuthConnections(): Promise<OAuthConnection[]> {
    return this.request<OAuthConnection[]>(
      "/connections",
      { method: "GET" },
      "We could not load your connected accounts.",
    );
  }

  /**
   * Disconnects an OAuth identity from the authenticated user.
   *
   * @param provider Provider to disconnect.
   */
  async disconnectOAuth(provider: OAuthProvider): Promise<void> {
    const response = await this.fetch(`/connections/${provider}`, { method: "DELETE" });
    if (!response.ok) {
      throw await authErrorFromResponse(response, `We could not disconnect ${provider}.`);
    }
  }

  /**
   * Signs the current user out of the backend session.
   */
  async signOut(): Promise<void> {
    const response = await this.fetch("/logout", { method: "POST" });
    if (!response.ok) throw await authErrorFromResponse(response, "We could not sign you out.");
  }

  /**
   * Builds the sign-in URL for a supported OAuth provider.
   *
   * @param provider Provider to initiate the OAuth redirect for.
   * @returns URL that begins the provider sign-in flow.
   */
  getOAuthSignInUrl(provider: OAuthProvider, options?: { next?: string }): string {
    return withReturnPath(`${this.appAuthPath}/oauth/${provider}`, options?.next);
  }

  /**
   * Builds the authenticated connection URL for a supported OAuth provider.
   *
   * @param provider Provider to connect.
   * @returns URL that begins the provider connection flow.
   */
  getOAuthConnectUrl(provider: OAuthProvider, options?: { next?: string }): string {
    return withReturnPath(`${this.appAuthPath}/oauth/${provider}/connect`, options?.next);
  }

  /**
   * Executes a JSON auth request using the configured app auth route.
   *
   * @param path Relative auth route path.
   * @param init Fetch options for the request.
   * @param fallback Friendly error message if the backend returns a non-JSON failure.
   * @returns Parsed JSON response payload.
   */
  private async request<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
    const response = await this.fetch(path, init);
    return readJson<T>(response, fallback);
  }

  /**
   * Performs the underlying fetch for an auth endpoint.
   *
   * @param path Relative auth route path.
   * @param init Request configuration.
   * @returns Response object from the auth route.
   */
  private async fetch(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(`${this.appAuthPath}${path}`, {
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

/**
 * Creates a client configured for the same-origin auth route used by the application.
 *
 * @param options Optional transport and routing configuration.
 * @returns Configured auth client instance.
 */
export function createAuthClient(options: AuthClientOptions = {}): AuthClient {
  return new HttpAuthClient(options);
}

/**
 * Shared singleton auth client bound to the default application auth route.
 */
export const authClient = createAuthClient();
