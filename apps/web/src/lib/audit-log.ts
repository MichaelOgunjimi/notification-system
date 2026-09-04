import type { AuditLogEntry } from "@beaco/control-plane";

const DESTRUCTIVE_VERBS = new Set(["revoked", "removed", "deleted", "archived", "rejected"]);

/**
 * Reports whether an action removed access or data, the one semantic
 * distinction the log surfaces highlight with colour.
 *
 * @param action Dotted action key, e.g. `api_key.revoked`.
 * @returns `true` when the trailing verb is destructive.
 */
export function isDestructiveAction(action: string): boolean {
  return DESTRUCTIVE_VERBS.has(action.split(/[._]/).pop() ?? "");
}

/**
 * Converts a machine action key into a sentence-cased label.
 *
 * @param action Dotted action key, e.g. `organization.member_role_updated`.
 * @returns A human label, e.g. `Organization member role updated`.
 */
export function humanizeAction(action: string): string {
  const spaced = action.replace(/[._]/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : action;
}

/**
 * Resolves the display name for whoever performed an entry, preferring the
 * person's name, then the API key's name, then a generic fallback for an actor
 * that no longer exists.
 *
 * @param entry Audit log entry.
 * @returns A non-empty label suitable for the "Who" column.
 */
export function actorLabel(entry: AuditLogEntry): string {
  if (entry.actorName) return entry.actorName;
  if (entry.apiKeyName) return entry.apiKeyName;
  if (entry.actorUserId) return "A former member";
  if (entry.apiKeyId) return "A deleted API key";
  return "System";
}

/**
 * Builds the secondary line shown beneath the actor name: the person's current
 * organization role, or the API key's environment.
 *
 * @param entry Audit log entry.
 * @returns The sub-label, or `null` when neither is known.
 */
export function actorRoleLabel(entry: AuditLogEntry): string | null {
  if (entry.actorName || entry.actorUserId) {
    return entry.actorRole ? capitalize(entry.actorRole) : null;
  }
  if (entry.apiKeyName || entry.apiKeyId) {
    return entry.apiKeyEnvironment ? `API key · ${entry.apiKeyEnvironment}` : "API key";
  }
  return null;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Selects the metadata fields worth showing, dropping empty values and internal
 * bookkeeping keys.
 *
 * @param metadata Raw metadata object from an entry.
 * @returns Ordered `[key, value]` pairs to render.
 */
export function metadataEntries(metadata: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(metadata).filter(
    ([key, value]) =>
      value !== null && value !== undefined && value !== "" && key !== "seed" && key !== "index",
  );
}

/**
 * Renders a single metadata value as a compact string.
 *
 * @param value Any JSON-serialisable metadata value.
 * @returns A one-line representation.
 */
export function formatMetadataValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Composes the one-line "resource · key: value · …" summary used by the Details
 * column of both log surfaces.
 *
 * @param entry Audit log entry.
 * @returns The summary string.
 */
export function detailsSummary(entry: AuditLogEntry): string {
  const resource = entry.resourceId
    ? `${entry.resourceType} ${entry.resourceId.slice(0, 8)}`
    : entry.resourceType;
  const meta = metadataEntries(entry.metadata)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${formatMetadataValue(value)}`)
    .join("  ·  ");
  return meta ? `${resource}  ·  ${meta}` : resource;
}

/** Shared absolute-timestamp formatter for entry detail panels and `title` text. */
export const absoluteFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const RELATIVE_STEPS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/**
 * Formats an ISO timestamp as a coarse relative phrase (`2 hours ago`,
 * `just now`).
 *
 * @param iso ISO 8601 timestamp.
 * @returns The relative phrase.
 */
export function relativeTime(iso: string): string {
  const elapsed = Date.parse(iso) - Date.now();
  for (const [unit, ms] of RELATIVE_STEPS) {
    if (Math.abs(elapsed) >= ms) return relativeFormatter.format(Math.round(elapsed / ms), unit);
  }
  return "just now";
}
