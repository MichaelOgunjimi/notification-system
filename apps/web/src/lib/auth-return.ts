const AUTH_RETURN_COOKIE = "beaco_auth_return";
const AUTH_RETURN_TTL_SECONDS = 15 * 60;

/**
 * Returns `path` only when it is a same-origin relative destination.
 *
 * Mirrors the backend `safe_next_path` guard so a crafted `?next=` cannot turn
 * the sign-in round-trip into an open redirect: the value must be rooted at a
 * single `/`, must not open a protocol-relative or backslash authority, and must
 * not smuggle a scheme or control characters.
 *
 * @param path Candidate destination, typically read from a `next` query value.
 * @returns The validated path, or null when it is missing or unsafe.
 */
export function safeInternalPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const candidate = path.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return null;
  if (candidate.includes("\\") || candidate.includes("://")) return null;
  for (const char of candidate) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return null;
  }
  return candidate;
}

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
 * Persists a validated return destination before leaving for an OAuth provider.
 *
 * The magic-link flow carries `next` in the emailed URL instead; this cookie
 * only bridges the same-browser OAuth redirect, which cannot round-trip a query
 * string of its own.
 *
 * @param path Candidate destination; ignored unless it passes {@link safeInternalPath}.
 * @sideEffect Writes a short-lived, same-site navigation cookie with no auth data.
 */
export function rememberAuthReturnPath(path: string | null | undefined): void {
  const safe = safeInternalPath(path);
  if (typeof document === "undefined" || !safe) return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AUTH_RETURN_COOKIE}=${encodeURIComponent(safe)}; Path=/; Max-Age=${AUTH_RETURN_TTL_SECONDS}; SameSite=Lax${secure}`;
}

/**
 * Reads and clears the pending post-sign-in return destination.
 *
 * @returns The validated return path, or null when none is pending.
 * @sideEffect Expires the temporary return cookie.
 */
export function consumeAuthReturnPath(): string | null {
  const safe = safeInternalPath(readCookie(AUTH_RETURN_COOKIE));
  if (typeof document !== "undefined") {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${AUTH_RETURN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  }
  return safe;
}
