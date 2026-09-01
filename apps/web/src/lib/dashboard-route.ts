const LAST_DASHBOARD_COOKIE = "beaco_last_dashboard";
const DASHBOARD_PATH_PATTERN = /^\/app\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

type RememberedDashboard = Readonly<{
  userId: string;
  path: string;
}>;

/**
 * Builds the canonical application URL for one organization and project.
 *
 * @param organizationSlug Backend-validated organization slug.
 * @param projectSlug Backend-validated project slug.
 * @returns Canonical dashboard path for the selected project.
 */
export function dashboardPath(organizationSlug: string, projectSlug: string): string {
  return `/app/${organizationSlug}/${projectSlug}`;
}

function parseRememberedDashboard(value: string | undefined): RememberedDashboard | null {
  if (!value) return null;

  try {
    const candidate = JSON.parse(decodeURIComponent(value)) as Partial<RememberedDashboard>;
    if (
      typeof candidate.userId !== "string" ||
      typeof candidate.path !== "string" ||
      !DASHBOARD_PATH_PATTERN.test(candidate.path)
    ) {
      return null;
    }
    return { userId: candidate.userId, path: candidate.path };
  } catch {
    return null;
  }
}

/**
 * Reads the last validated dashboard path for the supplied user.
 *
 * The cookie is only a navigation preference. Its path is constrained to the
 * canonical dashboard shape and still undergoes live membership validation at
 * the destination.
 *
 * @param userId Authenticated user whose browser preference may be restored.
 * @param cookieHeader Optional cookie string for tests; defaults to the browser cookie header.
 * @returns Remembered dashboard path, or null for missing, malformed, or another user's data.
 */
export function readLastDashboardPath(userId: string, cookieHeader?: string): string | null {
  const source = cookieHeader ?? (typeof document === "undefined" ? "" : document.cookie);
  const prefix = `${LAST_DASHBOARD_COOKIE}=`;
  const value = source
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  const remembered = parseRememberedDashboard(value);
  return remembered?.userId === userId ? remembered.path : null;
}

/**
 * Returns the authenticated landing destination for a user.
 *
 * @param userId Authenticated user whose previous project should be restored.
 * @returns Last validated dashboard path, falling back to the workspace selector.
 */
export function postAuthDestination(userId: string): string {
  return readLastDashboardPath(userId) ?? "/workspace";
}

/**
 * Stores a validated dashboard path as an account-specific browser preference.
 *
 * This does not grant access and contains no session token. Membership is
 * checked again whenever the destination route loads.
 *
 * @param userId Authenticated user associated with the preference.
 * @param path Canonical dashboard path that passed live membership validation.
 * @returns Nothing.
 */
export function rememberDashboardPath(userId: string, path: string): void {
  if (typeof document === "undefined" || !DASHBOARD_PATH_PATTERN.test(path)) return;

  const value = encodeURIComponent(JSON.stringify({ userId, path }));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LAST_DASHBOARD_COOKIE}=${value}; Path=/; Max-Age=${ONE_YEAR_IN_SECONDS}; SameSite=Lax${secure}`;
}
