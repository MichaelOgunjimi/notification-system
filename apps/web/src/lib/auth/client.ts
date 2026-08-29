import type {
  ApiError,
  AuthChangeCallback,
  AuthChangeEvent,
  AuthClientOptions,
  AuthMessage,
  AuthSession,
  AuthTokens,
  AuthUser,
} from "./contracts";

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & ApiError;
  if (response.ok) return body;

  const detail = Array.isArray(body.detail)
    ? body.detail.map((item) => item.msg).filter(Boolean).join(" ")
    : body.detail;
  throw new BeacoAuthError(detail || "The request could not be completed.", response.status);
}

export class BeacoAuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BeacoAuthError";
    this.status = status;
  }
}

/**
 * Browser SDK for Beaco's human-auth control plane.
 *
 * The SDK talks only to the same-origin Next.js BFF. Access and refresh tokens
 * remain in HTTP-only cookies and are never exposed to JavaScript or persisted
 * in localStorage.
 */
export class BeacoAuthClient {
  private readonly basePath: string;
  private readonly publicApiUrl: string;
  private readonly listeners = new Set<AuthChangeCallback>();
  private currentUser: AuthUser | null = null;
  private initialization: Promise<AuthSession> | null = null;

  constructor(options: AuthClientOptions = {}) {
    this.basePath = (options.basePath ?? "/api/auth").replace(/\/$/, "");
    this.publicApiUrl = (
      options.publicApiUrl ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:8000/api/v1"
    ).replace(/\/$/, "");
  }

  initialize(): Promise<AuthSession> {
    if (!this.initialization) {
      this.initialization = this.getSession()
        .then((user) => {
          this.emit("INITIAL_SESSION", user);
          return { user, isAuthenticated: user !== null };
        })
        .catch(() => {
          this.emit("INITIAL_SESSION", null);
          return { user: null, isAuthenticated: false };
        });
    }
    return this.initialization;
  }

  async requestMagicLink(email: string): Promise<AuthMessage> {
    const response = await this.request("/magic-link/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return readJson<AuthMessage>(response);
  }

  async verifyMagicLink(token: string): Promise<AuthUser> {
    const response = await this.request("/magic-link/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    const user = await readJson<AuthUser>(response);
    this.emit("SIGNED_IN", user);
    return user;
  }

  async establishOAuthSession(tokens: AuthTokens): Promise<AuthUser> {
    const response = await this.request("/oauth/session", {
      method: "POST",
      body: JSON.stringify(tokens),
    });
    const user = await readJson<AuthUser>(response);
    this.emit("SIGNED_IN", user);
    return user;
  }

  async getSession(): Promise<AuthUser | null> {
    const response = await this.request("/session", { method: "GET" });
    if (response.status === 401) {
      this.currentUser = null;
      return null;
    }
    const user = await readJson<AuthUser>(response);
    const event: AuthChangeEvent = this.currentUser ? "SESSION_REFRESHED" : "SIGNED_IN";
    this.currentUser = user;
    if (event === "SESSION_REFRESHED") this.emit(event, user);
    return user;
  }

  async signOut(): Promise<void> {
    const response = await this.request("/logout", { method: "POST" });
    await readJson<{ ok: boolean }>(response);
    this.emit("SIGNED_OUT", null);
  }

  githubLoginUrl(): string {
    return `${this.publicApiUrl}/oauth/github/login`;
  }

  getUser(): AuthUser | null {
    return this.currentUser;
  }

  onAuthStateChange(callback: AuthChangeCallback): { unsubscribe: () => void } {
    this.listeners.add(callback);
    return { unsubscribe: () => this.listeners.delete(callback) };
  }

  private request(path: string, init: RequestInit): Promise<Response> {
    return fetch(`${this.basePath}${path}`, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  }

  private emit(event: AuthChangeEvent, user: AuthUser | null): void {
    this.currentUser = user;
    for (const listener of this.listeners) listener(event, user);
  }
}

export const authClient = new BeacoAuthClient();

export const requestMagicLink = (email: string) => authClient.requestMagicLink(email);
export const verifyMagicLink = (token: string) => authClient.verifyMagicLink(token);
export const establishOAuthSession = (tokens: AuthTokens) => authClient.establishOAuthSession(tokens);
export const getSession = () => authClient.getSession();
export const signOut = () => authClient.signOut();
export const githubLoginUrl = () => authClient.githubLoginUrl();
