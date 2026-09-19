/**
 * Returns `path` only when it is a same-origin relative destination.
 *
 * Mirrors the backend `safe_next_path` guard so a crafted `?next=` cannot turn
 * a sign-in round-trip into an open redirect: the value must be rooted at a
 * single `/`, must not open a protocol-relative or backslash authority, and
 * must not smuggle a scheme or control characters.
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
