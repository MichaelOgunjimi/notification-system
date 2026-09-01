const OAUTH_RETURN_COOKIE = "beaco_oauth_return";
const OAUTH_RETURN_TTL_SECONDS = 10 * 60;
const ACCOUNT_SETTINGS_PATH =
  /^\/app\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\/settings\/account$/;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return value ? decodeURIComponent(value) : null;
}

/**
 * Reads the pending internal destination for an OAuth connection callback.
 *
 * @returns Validated account-settings path or null when absent or unsafe.
 */
export function readOAuthReturnPath(): string | null {
  const path = readCookie(OAUTH_RETURN_COOKIE);
  return path && ACCOUNT_SETTINGS_PATH.test(path) ? path : null;
}

/**
 * Stores a short-lived internal return destination before leaving for OAuth.
 *
 * @param path Canonical account-settings path for the active dashboard context.
 * @returns Whether the supplied path was accepted and persisted.
 * @sideEffect Writes a same-site navigation cookie without authentication data.
 */
export function rememberOAuthReturnPath(path: string): boolean {
  if (typeof document === "undefined" || !ACCOUNT_SETTINGS_PATH.test(path)) return false;

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${OAUTH_RETURN_COOKIE}=${encodeURIComponent(path)}; Path=/; Max-Age=${OAUTH_RETURN_TTL_SECONDS}; SameSite=Lax${secure}`;
  return true;
}

/**
 * Returns and removes the pending OAuth destination after callback completion.
 *
 * @returns Validated account-settings path or null when no destination exists.
 * @sideEffect Expires the temporary OAuth return cookie.
 */
export function consumeOAuthReturnPath(): string | null {
  const path = readOAuthReturnPath();
  if (typeof document !== "undefined") {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${OAUTH_RETURN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  }
  return path;
}
