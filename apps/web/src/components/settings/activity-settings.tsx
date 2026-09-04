"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CaretRight, ListBullets, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import type { AuditLogEntry, Organization, Project } from "@beaco/control-plane";
import { useOrganizationAuditLog, useProjectAuditLog } from "@beaco/control-plane/react";
import "./activity-settings.css";

type ActivitySettingsProps = Readonly<{
  organization: Organization;
  project: Project;
}>;

type Scope = "project" | "organization";
type ActorFilter = "" | "user" | "api_key";
type TimeRange = "all" | "24h" | "7d" | "30d" | "since";
type BadgeTone = "positive" | "negative" | "caution" | "neutral";

const PER_PAGE = 20;

const ACTOR_FILTERS: ReadonlyArray<{ value: ActorFilter; label: string }> = [
  { value: "", label: "Anyone" },
  { value: "user", label: "People" },
  { value: "api_key", label: "API keys" },
];

const TIME_RANGES: ReadonlyArray<{
  value: Exclude<TimeRange, "since">;
  label: string;
  ms: number;
}> = [
  { value: "all", label: "All time", ms: 0 },
  { value: "24h", label: "24 hours", ms: 86_400_000 },
  { value: "7d", label: "7 days", ms: 604_800_000 },
  { value: "30d", label: "30 days", ms: 2_592_000_000 },
];

const POSITIVE_VERBS = new Set(["created", "accepted", "added", "restored"]);
const NEGATIVE_VERBS = new Set(["revoked", "removed", "deleted", "archived", "rejected"]);
const CAUTION_VERBS = new Set(["updated", "rotated", "changed", "renamed"]);

/** Colour tone for an action badge, keyed on the trailing verb of the action. */
function actionTone(action: string): BadgeTone {
  const verb = action.split(/[._]/).pop() ?? "";
  if (POSITIVE_VERBS.has(verb)) return "positive";
  if (NEGATIVE_VERBS.has(verb)) return "negative";
  if (CAUTION_VERBS.has(verb)) return "caution";
  return "neutral";
}

/** Turns `organization.member_role_updated` into "Organization member role updated". */
function humanizeAction(action: string): string {
  const spaced = action.replace(/[._]/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : action;
}

function actorLabel(entry: AuditLogEntry): string {
  if (entry.actorName) return entry.actorName;
  if (entry.apiKeyName) return `${entry.apiKeyName} (API key)`;
  if (entry.actorUserId) return "A former member";
  if (entry.apiKeyId) return "A deleted API key";
  return "System";
}

/** Metadata keys worth surfacing, with empty and bookkeeping values dropped. */
function metadataEntries(metadata: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(metadata).filter(
    ([key, value]) =>
      value !== null && value !== undefined && value !== "" && key !== "seed" && key !== "index",
  );
}

function formatMetadataValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** One-line "resource · key: value · key: value" summary for the Details column. */
function detailsSummary(entry: AuditLogEntry): string {
  const resource = entry.resourceId
    ? `${entry.resourceType} ${entry.resourceId.slice(0, 8)}`
    : entry.resourceType;
  const meta = metadataEntries(entry.metadata)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${formatMetadataValue(value)}`)
    .join("  ·  ");
  return meta ? `${resource}  ·  ${meta}` : resource;
}

const absoluteFormatter = new Intl.DateTimeFormat(undefined, {
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

function relativeTime(iso: string): string {
  const elapsed = Date.parse(iso) - Date.now();
  for (const [unit, ms] of RELATIVE_STEPS) {
    if (Math.abs(elapsed) >= ms) return relativeFormatter.format(Math.round(elapsed / ms), unit);
  }
  return "just now";
}

/**
 * Renders the tenant activity log as a full-width, filterable log table.
 *
 * Every row expands in place to the recorded detail — resource, IP address, and
 * the raw metadata payload. Backend capabilities remain authoritative: the
 * organization scope is offered only when the caller holds
 * `organization:audit:read`.
 *
 * @param props Active organization and project scope.
 * @returns Paginated, filterable audit-log surface.
 */
export function ActivitySettings({ organization, project }: ActivitySettingsProps) {
  const capabilities = useMemo(
    () => new Set(organization.capabilities),
    [organization.capabilities],
  );
  const canReadOrganization = capabilities.has("organization:audit:read");

  const [scope, setScope] = useState<Scope>("project");
  const [actor, setActor] = useState<ActorFilter>("");
  const [actionInput, setActionInput] = useState("");
  const [action, setAction] = useState("");
  const [range, setRange] = useState<TimeRange>("all");
  const [sinceDate, setSinceDate] = useState("");
  // Frozen when a range is picked — never derived inline, or a fresh ISO string
  // on every render would churn the query key and refetch forever.
  const [sinceIso, setSinceIso] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Debounce the action search box. The first render already has the empty
  // filter applied, so skip that pass — otherwise any future change that seeds
  // `page` from the URL would be reset to 1 a beat after mount.
  const debounceMounted = useRef(false);
  useEffect(() => {
    if (!debounceMounted.current) {
      debounceMounted.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
      setAction(actionInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [actionInput]);

  const filter = {
    page,
    perPage: PER_PAGE,
    action: action || undefined,
    actor: actor || undefined,
    from: sinceIso,
  };
  const projectQuery = useProjectAuditLog(scope === "project" ? project.id : null, filter);
  const organizationQuery = useOrganizationAuditLog(
    scope === "organization" && canReadOrganization ? organization.id : null,
    filter,
  );
  const query = scope === "organization" ? organizationQuery : projectQuery;

  const entries = query.data?.items ?? [];
  const totalPages = query.data ? Math.max(1, query.data.totalPages) : 1;
  const filtersActive = actor !== "" || action !== "" || sinceIso !== undefined;

  function changeScope(next: Scope) {
    setScope(next);
    setPage(1);
    setExpandedId(null);
  }

  function changeRange(next: Exclude<TimeRange, "since">, ms: number) {
    setRange(next);
    setSinceDate("");
    setSinceIso(ms === 0 ? undefined : new Date(Date.now() - ms).toISOString());
    setPage(1);
  }

  function changeSinceDate(value: string) {
    setSinceDate(value);
    setRange(value ? "since" : "all");
    setSinceIso(value ? new Date(`${value}T00:00:00`).toISOString() : undefined);
    setPage(1);
  }

  return (
    <div className="activity-settings">
      <header className="activity-settings__heading">
        <div>
          <p>Accountability</p>
          <h1>Activity log</h1>
          <span>
            Every recorded change to{" "}
            {scope === "organization" ? "this organization" : "this project"} and who made it.
            Entries are immutable.
          </span>
        </div>
        <span className="activity-settings__tag">
          <ListBullets size={15} />
          {query.data ? `${query.data.total} entries` : "Counting…"}
        </span>
      </header>

      <div className="activity-settings__filters">
        {canReadOrganization ? (
          <div className="activity-settings__chips" role="group" aria-label="Scope">
            <button
              type="button"
              data-active={scope === "project" || undefined}
              onClick={() => changeScope("project")}
            >
              This project
            </button>
            <button
              type="button"
              data-active={scope === "organization" || undefined}
              onClick={() => changeScope("organization")}
            >
              Whole organization
            </button>
          </div>
        ) : null}

        <div className="activity-settings__chips" role="group" aria-label="Actor">
          {ACTOR_FILTERS.map((option) => (
            <button
              key={option.value || "any"}
              type="button"
              data-active={actor === option.value || undefined}
              onClick={() => {
                setActor(option.value);
                setPage(1);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="activity-settings__chips" role="group" aria-label="Time range">
          {TIME_RANGES.map((option) => (
            <button
              key={option.value}
              type="button"
              data-active={range === option.value || undefined}
              onClick={() => changeRange(option.value, option.ms)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="activity-settings__since">
          <span>Since</span>
          <input
            type="date"
            value={sinceDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => changeSinceDate(event.target.value)}
          />
        </label>

        <input
          type="search"
          className="activity-settings__search"
          placeholder="Filter by action, e.g. member"
          value={actionInput}
          onChange={(event) => setActionInput(event.target.value)}
          aria-label="Filter by action"
        />
      </div>

      {query.isError ? (
        <p className="activity-settings__message" role="alert">
          <WarningCircle size={15} />
          {query.error.message}
        </p>
      ) : null}

      <div className="activity-settings__table" aria-busy={query.isFetching || undefined}>
        <div className="activity-settings__scroll">
          <div className="activity-settings__grid activity-settings__grid--head">
            <span />
            <span>Time</span>
            <span>Action</span>
            <span>Actor</span>
            <span>IP address</span>
            <span>Details</span>
          </div>

          {query.isPending ? (
            <div className="activity-settings__state">
              <SpinnerGap size={16} className="animate-spin" /> Loading activity
            </div>
          ) : null}
          {!query.isPending && entries.length === 0 ? (
            <div className="activity-settings__state">
              {filtersActive ? "No entries match these filters." : "No activity recorded yet."}
            </div>
          ) : null}

          {entries.map((entry) => {
            const open = expandedId === entry.id;
            const detail = metadataEntries(entry.metadata);
            return (
              <div className="activity-settings__entry" key={entry.id}>
                <button
                  type="button"
                  className="activity-settings__grid activity-settings__row"
                  aria-expanded={open}
                  aria-controls={`activity-detail-${entry.id}`}
                  onClick={() => setExpandedId(open ? null : entry.id)}
                >
                  <CaretRight
                    className="activity-settings__caret"
                    data-open={open || undefined}
                    size={11}
                    weight="bold"
                  />
                  <time
                    className="activity-settings__cell activity-settings__cell--time"
                    dateTime={entry.createdAt}
                    title={absoluteFormatter.format(new Date(entry.createdAt))}
                  >
                    {relativeTime(entry.createdAt)}
                  </time>
                  <span className="activity-settings__cell">
                    <span
                      className="activity-settings__badge"
                      data-tone={actionTone(entry.action)}
                      title={entry.action}
                    >
                      {humanizeAction(entry.action)}
                    </span>
                  </span>
                  <span className="activity-settings__cell activity-settings__cell--strong">
                    {actorLabel(entry)}
                  </span>
                  <span className="activity-settings__cell activity-settings__cell--mono">
                    {entry.ipAddress ?? "—"}
                  </span>
                  <span className="activity-settings__cell activity-settings__cell--details">
                    {detailsSummary(entry)}
                  </span>
                </button>
                {open ? (
                  <div className="activity-settings__detail" id={`activity-detail-${entry.id}`}>
                    <dl className="activity-settings__detail-grid">
                      <div>
                        <dt>When</dt>
                        <dd>{absoluteFormatter.format(new Date(entry.createdAt))}</dd>
                      </div>
                      <div>
                        <dt>Resource</dt>
                        <dd>
                          {entry.resourceType}
                          {entry.resourceId ? ` · ${entry.resourceId}` : ""}
                        </dd>
                      </div>
                      <div>
                        <dt>IP address</dt>
                        <dd>{entry.ipAddress ?? "Not recorded"}</dd>
                      </div>
                      <div>
                        <dt>Action key</dt>
                        <dd>{entry.action}</dd>
                      </div>
                    </dl>
                    {detail.length > 0 ? (
                      <div className="activity-settings__metadata">
                        {detail.map(([key, value]) => (
                          <div key={key}>
                            <span>{key.replace(/_/g, " ")}</span>
                            <code>{formatMetadataValue(value)}</code>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="activity-settings__metadata-empty">
                        No additional details recorded.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {totalPages > 1 ? (
          <div className="activity-settings__pager">
            <span>
              Page {page} of {totalPages}
              {query.data ? ` · ${query.data.total} entries` : ""}
            </span>
            <div className="activity-settings__pager-buttons">
              <button
                type="button"
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages || query.isFetching}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
