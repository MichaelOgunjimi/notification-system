const SIDEBAR_COLLAPSED_COOKIE = "beaco_sidebar_collapsed";
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/**
 * Reads the persisted desktop sidebar preference from a cookie string.
 *
 * @param cookieHeader Optional cookie string for server-side consumers; defaults to document cookies.
 * @returns True when the dashboard sidebar should initially render collapsed.
 */
export function readSidebarCollapsedPreference(cookieHeader?: string): boolean {
  const source = cookieHeader ?? (typeof document === "undefined" ? "" : document.cookie);
  const prefix = `${SIDEBAR_COLLAPSED_COOKIE}=`;
  const value = source
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return value === "1";
}

/**
 * Persists the desktop sidebar preference for future dashboard mounts.
 *
 * Mobile drawer visibility is deliberately excluded because it is temporary
 * navigation state rather than a layout preference.
 *
 * @param collapsed Whether the desktop sidebar should render collapsed.
 * @returns Nothing.
 * @sideEffect Writes a one-year, same-site browser preference cookie.
 */
export function rememberSidebarCollapsedPreference(collapsed: boolean): void {
  if (typeof document === "undefined") return;

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${collapsed ? "1" : "0"}; Path=/; Max-Age=${ONE_YEAR_IN_SECONDS}; SameSite=Lax${secure}`;
}
