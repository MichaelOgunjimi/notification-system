import { NextResponse, type NextRequest } from "next/server";
import type { OAuthProvider, User } from "./types";

type BackendUser = {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  email_verified_at: string | null;
  created_at: string;
};

type BackendTokenSet = {
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

const ACCESS_COOKIE = "beaco_access_token";
const REFRESH_COOKIE = "beaco_refresh_token";
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  priority: "high" as const,
};

function isSecureRequest(request: NextRequest): boolean {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwardedProtocol
    ? forwardedProtocol === "https"
    : request.nextUrl.protocol === "https:";
}

function writeSessionCookies(
  response: NextResponse,
  tokens: BackendTokenSet,
  secure: boolean,
  refreshCookiePath: string,
): void {
  response.cookies.set(ACCESS_COOKIE, tokens.access_token, {
    ...cookieOptions,
    maxAge: 60 * 15,
    path: "/",
    secure,
  });
  response.cookies.set(REFRESH_COOKIE, tokens.refresh_token, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30,
    path: refreshCookiePath,
    secure,
  });
}

function deleteSessionCookies(
  response: NextResponse,
  secure: boolean,
  refreshCookiePath: string,
): void {
  response.cookies.set(ACCESS_COOKIE, "", {
    ...cookieOptions,
    maxAge: 0,
    path: "/",
    secure,
  });
  response.cookies.set(REFRESH_COOKIE, "", {
    ...cookieOptions,
    maxAge: 0,
    path: refreshCookiePath,
    secure,
  });
}

function toUser(user: BackendUser): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isActive: user.is_active,
    emailVerifiedAt: user.email_verified_at,
    createdAt: user.created_at,
  };
}

export function createNextAuthAdapter(
  options: NextAuthAdapterOptions,
): NextAuthAdapter {
  const appAuthPath = (options.appAuthPath ?? "/api/auth").replace(/\/$/, "");
  const backendApiUrl = options.backendApiUrl.replace(/\/$/, "");
  const publicBackendApiUrl = options.publicBackendApiUrl.replace(/\/$/, "");
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function refreshSession(refreshToken: string): Promise<BackendTokenSet | null> {
    const response = await fetcher(`${backendApiUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    return response.ok ? ((await response.json()) as BackendTokenSet) : null;
  }

  async function fetchUser(accessToken: string): Promise<User | null> {
    const response = await fetcher(`${backendApiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return toUser((await response.json()) as BackendUser);
  }

  async function exchangeForSession(
    request: NextRequest,
    backendPath: string,
  ): Promise<Response> {
    try {
      const upstream = await fetcher(`${backendApiUrl}${backendPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await request.text(),
        cache: "no-store",
      });
      if (!upstream.ok) {
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            "Content-Type": upstream.headers.get("content-type") ?? "application/json",
          },
        });
      }

      const tokens = (await upstream.json()) as BackendTokenSet;
      const user = await fetchUser(tokens.access_token);
      if (!user) {
        return NextResponse.json(
          { detail: "Unable to create a session." },
          { status: 502 },
        );
      }

      const response = NextResponse.json(user);
      writeSessionCookies(response, tokens, isSecureRequest(request), appAuthPath);
      return response;
    } catch {
      return NextResponse.json(
        { detail: "The sign-in service is unavailable." },
        { status: 502 },
      );
    }
  }

  async function proxyPost(request: NextRequest, backendPath: string): Promise<Response> {
    try {
      const upstream = await fetcher(`${backendApiUrl}${backendPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await request.text(),
        cache: "no-store",
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        },
      });
    } catch {
      return NextResponse.json(
        { detail: "The sign-in service is unavailable." },
        { status: 502 },
      );
    }
  }

  return {
    exchangeOAuth(request) {
      return exchangeForSession(request, "/auth/oauth/exchange");
    },
    async logout(request) {
      const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
      if (refreshToken) {
        await fetcher(`${backendApiUrl}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
          cache: "no-store",
        }).catch(() => undefined);
      }
      const response = NextResponse.json({ ok: true });
      deleteSessionCookies(response, isSecureRequest(request), appAuthPath);
      return response;
    },
    requestMagicLink(request) {
      return proxyPost(request, "/auth/magic-link/request");
    },
    async forwardAuthenticated(request, backendPath) {
      if (!backendPath.startsWith("/") || backendPath.includes("://")) {
        return NextResponse.json({ detail: "Invalid backend path." }, { status: 500 });
      }

      const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
      const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
      const requestBody = request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer();

      const callBackend = (token: string) => fetcher(`${backendApiUrl}${backendPath}`, {
        method: request.method,
        headers: {
          Accept: request.headers.get("accept") ?? "application/json",
          Authorization: `Bearer ${token}`,
          ...(requestBody
            ? { "Content-Type": request.headers.get("content-type") ?? "application/json" }
            : {}),
        },
        body: requestBody,
        cache: "no-store",
      });

      try {
        let tokens: BackendTokenSet | null = null;
        let upstream = accessToken ? await callBackend(accessToken) : null;

        if ((!upstream || upstream.status === 401) && refreshToken) {
          tokens = await refreshSession(refreshToken);
          upstream = tokens ? await callBackend(tokens.access_token) : null;
        }

        if (!upstream) {
          const response = NextResponse.json(
            { detail: "Not authenticated." },
            { status: 401 },
          );
          deleteSessionCookies(response, isSecureRequest(request), appAuthPath);
          return response;
        }

        const response = new NextResponse(upstream.body, {
          status: upstream.status,
          headers: {
            "Cache-Control": "private, no-store",
            "Content-Type": upstream.headers.get("content-type") ?? "application/json",
          },
        });
        if (tokens) {
          writeSessionCookies(response, tokens, isSecureRequest(request), appAuthPath);
        } else if (upstream.status === 401) {
          deleteSessionCookies(response, isSecureRequest(request), appAuthPath);
        }
        return response;
      } catch {
        return NextResponse.json(
          { detail: "The application service is unavailable." },
          { status: 502 },
        );
      }
    },
    verifyMagicLink(request) {
      return exchangeForSession(request, "/auth/magic-link/verify");
    },
    startOAuth(provider) {
      return () =>
        NextResponse.redirect(`${publicBackendApiUrl}/oauth/${provider}/login`, 307);
    },
    async session(request) {
      const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
      const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

      if (accessToken) {
        const user = await fetchUser(accessToken);
        if (user) return NextResponse.json(user);
      }

      if (refreshToken) {
        const tokens = await refreshSession(refreshToken);
        if (tokens) {
          const user = await fetchUser(tokens.access_token);
          if (user) {
            const response = NextResponse.json(user);
            writeSessionCookies(response, tokens, isSecureRequest(request), appAuthPath);
            return response;
          }
        }
      }

      const response = NextResponse.json({ detail: "Not authenticated." }, { status: 401 });
      deleteSessionCookies(response, isSecureRequest(request), appAuthPath);
      return response;
    },
  };
}
