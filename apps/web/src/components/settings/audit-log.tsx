"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AuditLogEntry, Organization, Project } from "@beaco/control-plane";
import { useOrganizationAuditLog, useProjectAuditLog } from "@beaco/control-plane/react";
import { LogEntryDetail, LogTable, type LogColumn } from "@/components/ui/log-table";
import { LogFilters, type DateRangeKey, type LogFilterValue } from "@/components/ui/log-filters";
import { TablePager } from "@/components/ui/table-pager";
import {
  actorLabel,
  actorRoleLabel,
  detailsSummary,
  humanizeAction,
  isDestructiveAction,
  relativeTime,
} from "@/lib/audit-log";
import "./audit-log.css";

type AuditLogProps = Readonly<{
  organization: Organization;
  project: Project;
  projects: readonly Project[];
}>;

const PER_PAGE_OPTIONS = [10, 25, 50] as const;

const PRESET_MS: Record<Exclude<DateRangeKey, "all" | "custom">, number> = {
  "24h": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
};

const ACTOR_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Anyone" },
  { value: "user", label: "People" },
  { value: "api_key", label: "API keys" },
];

type LogUrlState = LogFilterValue & Readonly<{ actor: string; page: number; perPage: number }>;

function parseRange(value: string | null): DateRangeKey {
  return value === "24h" ||
    value === "7d" ||
    value === "30d" ||
    value === "custom" ||
    value === "all"
    ? value
    : "all";
}

/**
 * Reads the log view's filters from the URL and writes changes back with
 * `router.replace`, so the view survives back-navigation and refresh and is
 * linkable. Any filter change resets the page; paging and page-size do not.
 */
function useLogUrlState(): {
  state: LogUrlState;
  patch: (next: Partial<LogUrlState>) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const state = useMemo<LogUrlState>(() => {
    const perPage = Number(params.get("perPage"));
    return {
      project: params.get("project") ?? "",
      actor: params.get("actor") ?? "",
      range: parseRange(params.get("range")),
      from: params.get("from") ?? "",
      to: params.get("to") ?? "",
      action: params.get("action") ?? "",
      page: Math.max(1, Number(params.get("page")) || 1),
      perPage: PER_PAGE_OPTIONS.includes(perPage as (typeof PER_PAGE_OPTIONS)[number])
        ? perPage
        : PER_PAGE_OPTIONS[1],
    };
  }, [params]);

  const patch = useCallback(
    (next: Partial<LogUrlState>) => {
      const merged = { ...state, ...next };
      const pagingOnly = Object.keys(next).every((k) => k === "page" || k === "perPage");
      if (!pagingOnly && next.page === undefined) merged.page = 1;

      const search = new URLSearchParams();
      if (merged.project) search.set("project", merged.project);
      if (merged.actor) search.set("actor", merged.actor);
      if (merged.range !== "all") search.set("range", merged.range);
      if (merged.range === "custom" && merged.from) search.set("from", merged.from);
      if (merged.range === "custom" && merged.to) search.set("to", merged.to);
      if (merged.action) search.set("action", merged.action);
      if (merged.page > 1) search.set("page", String(merged.page));
      if (merged.perPage !== PER_PAGE_OPTIONS[1]) search.set("perPage", String(merged.perPage));

      const query = search.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, state],
  );

  return { state, patch };
}

/**
 * Governance audit log — every change to the organization and its projects and
 * who made it. Org-wide by default with a project filter; falls back to
 * project-scoped when the caller lacks `organization:audit:read`.
 *
 * @param props Active organization, project, and the sibling project list.
 * @returns The audit log surface.
 */
export function AuditLog({ organization, project, projects }: AuditLogProps) {
  const { state, patch } = useLogUrlState();
  const canReadOrganization = useMemo(
    () => new Set(organization.capabilities).has("organization:audit:read"),
    [organization.capabilities],
  );

  // Preset windows are recomputed only when the range key changes, never inline,
  // so the query key stays stable between renders.
  const dateWindow = useMemo(() => {
    if (state.range === "custom") {
      return { from: state.from || undefined, to: state.to || undefined };
    }
    if (state.range === "all") return { from: undefined, to: undefined };
    return { from: new Date(Date.now() - PRESET_MS[state.range]).toISOString(), to: undefined };
  }, [state.range, state.from, state.to]);

  const filter = {
    page: state.page,
    perPage: state.perPage,
    category: "governance" as const,
    action: state.action || undefined,
    actor: state.actor || undefined,
    from: dateWindow.from,
    to: dateWindow.to,
  };

  // Without the org capability the project filter is meaningless — always scope
  // to the active project.
  const scopeProjectId = canReadOrganization ? state.project : project.id;
  const orgQuery = useOrganizationAuditLog(
    canReadOrganization && !scopeProjectId ? organization.id : null,
    filter,
  );
  const projectQuery = useProjectAuditLog(scopeProjectId || null, filter);
  const query = scopeProjectId ? projectQuery : orgQuery;

  const entries = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = query.data ? Math.max(1, query.data.totalPages) : 1;

  const columns: ReadonlyArray<LogColumn<AuditLogEntry>> = [
    {
      key: "time",
      label: "Time",
      width: "108px",
      render: (entry) => (
        <time
          className="audit-log__time"
          dateTime={entry.createdAt}
          title={new Date(entry.createdAt).toLocaleString()}
        >
          {relativeTime(entry.createdAt)}
        </time>
      ),
    },
    {
      key: "action",
      label: "Action",
      width: "minmax(170px, 280px)",
      render: (entry) => (
        <span
          className="audit-log__action"
          data-destructive={isDestructiveAction(entry.action) || undefined}
          title={entry.action}
        >
          {humanizeAction(entry.action)}
        </span>
      ),
    },
    {
      key: "who",
      label: "Who",
      width: "minmax(150px, 220px)",
      render: (entry) => {
        const role = actorRoleLabel(entry);
        return (
          <span className="audit-log__who">
            {actorLabel(entry)}
            {role ? <span className="audit-log__role">{role}</span> : null}
          </span>
        );
      },
    },
    {
      key: "details",
      label: "Details",
      width: "minmax(200px, 1fr)",
      render: (entry) => <span className="audit-log__details">{detailsSummary(entry)}</span>,
    },
  ];

  const filtersActive =
    state.actor !== "" || state.action !== "" || state.range !== "all" || state.project !== "";

  return (
    <div className="audit-log">
      <header className="audit-log__heading">
        <div>
          <p>Accountability</p>
          <h1>Audit log</h1>
          <span>
            Every change to your organization and projects, and who made it. Entries are immutable.
          </span>
        </div>
        <span className="audit-log__tag" title="Refreshes automatically">
          <span className="audit-log__live" aria-hidden />
          {query.data ? `${query.data.total.toLocaleString()} entries` : "Counting…"}
        </span>
      </header>

      <LogFilters
        value={state}
        onChange={patch}
        projects={canReadOrganization ? projects : [project]}
      >
        <div className="audit-log__actor" role="group" aria-label="Actor">
          {ACTOR_FILTERS.map((option) => (
            <button
              key={option.value || "any"}
              type="button"
              data-active={state.actor === option.value || undefined}
              onClick={() => patch({ actor: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </LogFilters>

      <LogTable
        columns={columns}
        rows={entries}
        rowKey={(entry) => entry.id}
        renderExpanded={(entry) => <LogEntryDetail entry={entry} />}
        pending={query.isPending}
        busy={query.isFetching}
        error={query.isError ? query.error.message : null}
        emptyLabel={filtersActive ? "No entries match these filters." : "No changes recorded yet."}
        footer={
          <TablePager
            page={state.page}
            totalPages={totalPages}
            total={total}
            perPage={state.perPage}
            perPageOptions={PER_PAGE_OPTIONS}
            busy={query.isFetching}
            onPageChange={(page) => patch({ page })}
            onPerPageChange={(perPage) => patch({ perPage, page: 1 })}
          />
        }
      />
    </div>
  );
}
