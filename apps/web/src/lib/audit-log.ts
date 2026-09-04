import type { AuditLogEntry } from "@beaco/control-plane";

/** Semantic color a {@link LogPill} can render in — see `components/ui/log-pill.tsx`. */
export type LogTone = "success" | "info" | "warning" | "danger" | "neutral";

const ACTION_TONE_BY_VERB: Readonly<Record<string, LogTone>> = {
  created: "info",
  sent: "info",
  updated: "info",
  completed: "success",
  delivered: "success",
  accepted: "success",
  retried: "warning",
  rotated: "danger",
  failed: "danger",
  revoked: "danger",
  removed: "danger",
  deleted: "danger",
  archived: "danger",
  rejected: "danger",
};

/** Outcome a completed delivery/processing action resolved to, keyed by its full action. */
const STATUS_BY_ACTION: Readonly<Record<string, { label: string; tone: LogTone }>> = {
  "event.created": { label: "Processing", tone: "info" },
  "event.completed": { label: "Completed", tone: "success" },
  "event.failed": { label: "Failed", tone: "danger" },
  "notification.sent": { label: "Processing", tone: "info" },
  "notification.delivered": { label: "Completed", tone: "success" },
  "notification.failed": { label: "Failed", tone: "danger" },
  "notification.retried": { label: "Retrying", tone: "warning" },
};

/**
 * Picks the color an action's own verb implies — success for a completed
 * delivery, danger for a failure or a destructive change, and so on.
 *
 * @param action Dotted action key, e.g. `notification.delivered`.
 * @returns The tone to render the action pill in; `"neutral"` when the verb
 *   carries no outcome (e.g. most governance edits).
 */
export function actionTone(action: string): LogTone {
  const verb = action.split(/[._]/).pop() ?? "";
  return ACTION_TONE_BY_VERB[verb] ?? "neutral";
}

/**
 * Resolves the outcome of a delivery/processing action, for surfaces that show
 * a dedicated Status column alongside the action itself.
 *
 * @param action Dotted action key, e.g. `event.completed`.
 * @returns The status label and tone, or `null` when the action has no
 *   terminal outcome to report (e.g. a template edit).
 */
export function statusForAction(action: string): { label: string; tone: LogTone } | null {
  return STATUS_BY_ACTION[action] ?? null;
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
