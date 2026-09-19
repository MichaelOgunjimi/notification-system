/** Matches a canonical URL slug: lowercase alphanumerics joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Derives a canonical slug from free text.
 *
 * @param value Human-entered name.
 * @returns Lowercase hyphenated slug, or an empty string when nothing usable remains.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generates a short random suffix for disambiguating auto-derived slugs.
 *
 * @param length Number of characters (default 6).
 * @returns Lowercase alphanumeric string safe to append after a hyphen.
 */
export function randomSlugSuffix(length = 6): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let index = 0; index < length; index += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return suffix;
}

/**
 * Slugifies a name and appends a hyphenated suffix so auto-derived slugs do not
 * collide. Returns an empty string when the name yields no usable slug.
 *
 * @param name Human-entered name.
 * @param suffix Stable suffix from {@link randomSlugSuffix}.
 * @returns `"<slug>-<suffix>"`, or `""` when the name is empty.
 */
export function slugWithSuffix(name: string, suffix: string): string {
  const base = slugify(name);
  return base ? `${base}-${suffix}` : "";
}
