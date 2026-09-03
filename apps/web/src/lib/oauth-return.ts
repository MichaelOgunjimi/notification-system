const ACCOUNT_SETTINGS_PATH =
  /^\/app\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\/settings\/account$/;

/**
 * Returns `path` only when it is a canonical account-settings destination.
 *
 * The "connect GitHub" flow always returns the user to their own account
 * settings, so its `next` is held to that exact shape rather than the broader
 * same-origin check used for post-sign-in redirects. The backend still
 * re-validates the value before it can drive a redirect.
 *
 * @param path Candidate return path for the OAuth connect round-trip.
 * @returns The path when it matches the account-settings shape, else null.
 */
export function accountSettingsReturnPath(path: string | null | undefined): string | null {
  return path && ACCOUNT_SETTINGS_PATH.test(path) ? path : null;
}
