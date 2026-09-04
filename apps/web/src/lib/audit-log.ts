import type { AuditLogEntry } from "@beaco/control-plane";

const DESTRUCTIVE_VERBS = new Set(["revoked", "removed", "deleted", "archived", "rejected"]);

/** Whether an action took something away — the only distinction worth a colour. */
export function isDestructiveAction(action: string): boolean {
  return DESTRUCTIVE_VERBS.has(action.split(/[._]/).pop() ?? "");
}

/** Turns `organization.member_role_updated` into "Organization member role updated". */
export function humanizeAction(action: string): string {
  const spaced = action.replace(/[._]/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : action;
}

/** Display name for whoever performed an entry. */
export function actorLabel(entry: AuditLogEntry): string {
  if (entry.actorName) return entry.actorName;
  if (entry.apiKeyName) return entry.apiKeyName;
  if (entry.actorUserId) return "A former member";
  if (entry.apiKeyId) return "A deleted API key";
  return "System";
}

/** Secondary line under the actor name: org role for people, environment for keys. */
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

/** Metadata keys worth surfacing, with empty and bookkeeping values dropped. */
export function metadataEntries(metadata: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(metadata).filter(
    ([key, value]) =>
      value !== null && value !== undefined && value !== "" && key !== "seed" && key !== "index",
  );
}

export function formatMetadataValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** One-line "resource · key: value · key: value" summary for a Details column. */
export function detailsSummary(entry: AuditLogEntry): string {
  const resource = entry.resourceId
    ? `${entry.resourceType} ${entry.resourceId.slice(0, 8)}`
    : entry.resourceType;
  const meta = metadataEntries(entry.metadata)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${formatMetadataValue(value)}`)
    .join("  ·  ");
  return meta ? `${resource}  ·  ${meta}` : resource;
}

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

export function relativeTime(iso: string): string {
  const elapsed = Date.parse(iso) - Date.now();
  for (const [unit, ms] of RELATIVE_STEPS) {
    if (Math.abs(elapsed) >= ms) return relativeFormatter.format(Math.round(elapsed / ms), unit);
  }
  return "just now";
}
