"use client";

import { useEffect, useMemo, useState } from "react";
import { ListBullets, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import type { AuditLogEntry, Organization, Project } from "@beaco/control-plane";
import { useOrganizationAuditLog, useProjectAuditLog } from "@beaco/control-plane/react";
import "./activity-settings.css";

type ActivitySettingsProps = Readonly<{
  organization: Organization;
  project: Project;
}>;

type Scope = "project" | "organization";
type ActorFilter = "" | "user" | "api_key";

const PER_PAGE = 20;

const ACTOR_FILTERS: ReadonlyArray<{ value: ActorFilter; label: string }> = [
  { value: "", label: "Anyone" },
  { value: "user", label: "People" },
  { value: "api_key", label: "API keys" },
];

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
 * Renders the tenant activity log with scope, actor, and action filters.
 *
 * Backend capabilities remain authoritative: the organization scope is offered
 * only when the caller holds `organization:audit:read`.
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
  const [page, setPage] = useState(1);

  useEffect(() => {
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
  };
  const projectQuery = useProjectAuditLog(scope === "project" ? project.id : null, filter);
  const organizationQuery = useOrganizationAuditLog(
    scope === "organization" && canReadOrganization ? organization.id : null,
    filter,
  );
  const query = scope === "organization" ? organizationQuery : projectQuery;

  const entries = query.data?.items ?? [];
  const totalPages = query.data ? Math.max(1, query.data.totalPages) : 1;
  const filtersActive = actor !== "" || action !== "";

  function changeScope(next: Scope) {
    setScope(next);
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
          {query.data?.total ?? 0} entries
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
        <p className="activity-settings__message" data-tone="error" role="alert">
          <WarningCircle size={15} />
          {query.error.message}
        </p>
      ) : null}

      <ol className="activity-settings__list" aria-busy={query.isFetching || undefined}>
        {query.isPending ? (
          <li className="activity-settings__empty">
            <SpinnerGap size={16} className="animate-spin" /> Loading activity
          </li>
        ) : null}
        {!query.isPending && entries.length === 0 ? (
          <li className="activity-settings__empty">
            {filtersActive ? "No entries match these filters." : "No activity recorded yet."}
          </li>
        ) : null}
        {entries.map((entry) => (
          <li key={entry.id} className="activity-settings__row">
            <div className="activity-settings__row-main">
              <strong title={entry.action}>{humanizeAction(entry.action)}</strong>
              <span className="activity-settings__meta">by {actorLabel(entry)}</span>
            </div>
            <time
              className="activity-settings__time"
              dateTime={entry.createdAt}
              title={absoluteFormatter.format(new Date(entry.createdAt))}
            >
              {relativeTime(entry.createdAt)}
            </time>
          </li>
        ))}
      </ol>

      {totalPages > 1 ? (
        <div className="activity-settings__pager">
          <button
            type="button"
            disabled={page <= 1 || query.isFetching}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || query.isFetching}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
