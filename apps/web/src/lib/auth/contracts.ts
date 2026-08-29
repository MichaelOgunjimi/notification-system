export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  email_verified_at: string | null;
  created_at: string;
};

export type AuthMessage = {
  message: string;
};

export type ApiError = {
  detail?: string | Array<{ msg?: string }>;
};

export type AuthChangeEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "SESSION_REFRESHED";

export type AuthChangeCallback = (
  event: AuthChangeEvent,
  user: AuthUser | null,
) => void;

export type AuthClientOptions = {
  /** Base path for the Next.js auth BFF. Tokens never enter browser storage. */
  basePath?: string;
  /** Backend public URL used only to start OAuth redirects. */
  publicApiUrl?: string;
};

export type AuthSession = {
  user: AuthUser | null;
  isAuthenticated: boolean;
};
