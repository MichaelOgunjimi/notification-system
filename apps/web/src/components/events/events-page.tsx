"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CaretRight } from "@phosphor-icons/react";
import type {
  EventPriority,
  EventStatus,
  Organization,
  Project,
  TenantEvent,
} from "@beaco/control-plane";
import { useOrganizationEvents, useProjectEvents } from "@beaco/control-plane/react";
import { AppSelect } from "@/components/ui/app-select";
import { TablePager } from "@/components/ui/table-pager";
import { relativeTime } from "@/lib/audit-log";
import "./events-page.css";

/** Props for {@link EventsPage}. */
type EventsPageProps = Readonly<{
  organization: Organization;
  project: Project;
  projects: readonly Project[];
}>;

const PER_PAGE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_PER_PAGE = PER_PAGE_OPTIONS[0];

const STATUS_CHIPS: ReadonlyArray<{ value: EventStatus | ""; label: string }> = [
  { value: "", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "processing", label: "Processing" },
];

const PRIORITY_OPTIONS: ReadonlyArray<{ value: EventPriority | ""; label: string }> = [
  { value: "", label: "Any priority" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const RANGE_CHIPS: ReadonlyArray<{ value: "24h" | "7d" | "30d" | "all"; label: string }> = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "all", label: "All" },
];

const RANGE_MS: Record<"24h" | "7d" | "30d", number> = {
  "24h": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
};

/**
 * ISO lower bound for a range preset, or `undefined` for "all". Kept out of
 * the component so the `Date.now()` read sits behind a call boundary; callers
 * must still invoke it inside a `useMemo` keyed on the range.
 */
function rangeFrom(range: "24h" | "7d" | "30d" | "all"): string | undefined {
  if (range === "all") return undefined;
  return new Date(Date.now() - RANGE_MS[range]).toISOString();
}

const STATUS_LABEL: Record<string, string> = {
  accepted: "Accepted",
  processing: "Processing",
  completed: "Completed",
  partially_failed: "Partially failed",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** Which visual tone a status badge takes. */
function statusTone(status: string): "success" | "danger" | "warning" | "muted" {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "processing" || status === "partially_failed") return "warning";
  return "muted";
}

type EventsUrlState = Readonly<{
  project: string;
  status: EventStatus | "";
  priority: EventPriority | "";
  range: "24h" | "7d" | "30d" | "all";
  search: string;
  page: number;
  perPage: number;
}>;

function useEventsUrlState(): {
  state: EventsUrlState;
  patch: (next: Partial<EventsUrlState>) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const state = useMemo<EventsUrlState>(() => {
    const perPage = Number(params.get("perPage"));
    const status = params.get("status");
    const priority = params.get("priority");
    const range = params.get("range");
    return {
      project: params.get("project") ?? "",
      status:
        status === "completed" || status === "failed" || status === "processing" ? status : "",
      priority: priority === "high" || priority === "medium" || priority === "low" ? priority : "",
      range: range === "24h" || range === "30d" || range === "all" ? range : "7d",
      search: params.get("search") ?? "",
      page: Math.max(1, Number(params.get("page")) || 1),
      perPage: (PER_PAGE_OPTIONS as readonly number[]).includes(perPage)
        ? perPage
        : DEFAULT_PER_PAGE,
    };
  }, [params]);

  function patch(next: Partial<EventsUrlState>) {
    const merged = { ...state, ...next };
    const pagingOnly = Object.keys(next).every((key) => key === "page" || key === "perPage");
    if (!pagingOnly && next.page === undefined) merged.page = 1;

    const search = new URLSearchParams();
    if (merged.project) search.set("project", merged.project);
    if (merged.status) search.set("status", merged.status);
    if (merged.priority) search.set("priority", merged.priority);
    if (merged.range !== "7d") search.set("range", merged.range);
    if (merged.search) search.set("search", merged.search);
    if (merged.page > 1) search.set("page", String(merged.page));
    if (merged.perPage !== DEFAULT_PER_PAGE) search.set("perPage", String(merged.perPage));

    const query = search.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return { state, patch };
}

/**
 * Tenant event log — every ingested notification request for the selected
 * project (or the whole organization), with status, priority, and fan-out
 * failure at a glance. Rows navigate to a per-event detail page.
 *
 * @param props Active organization, project, and the sibling project list.
 * @returns The events surface.
 */
export function EventsPage({ organization, project, projects }: EventsPageProps) {
  const router = useRouter();
  const { state, patch } = useEventsUrlState();
  const canReadOrganization = useMemo(
    () => new Set(organization.capabilities).has("organization:usage:read"),
    [organization.capabilities],
  );

  const wantsAllProjects = canReadOrganization && state.project === "all";
  const scopeProjectId = wantsAllProjects
    ? ""
    : canReadOrganization
      ? state.project || project.id
      : project.id;
  const orgWide = wantsAllProjects ? organization.id : null;

  const projectsById = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p] as const));
    map.set(project.id, project);
    return map;
  }, [projects, project]);

  const from = useMemo(() => rangeFrom(state.range), [state.range]);

  const filter = {
    page: state.page,
    perPage: state.perPage,
    status: state.status || undefined,
    priority: state.priority || undefined,
    eventType: state.search || undefined,
    from,
  };

  const projectQuery = useProjectEvents(scopeProjectId || null, filter);
  const orgQuery = useOrganizationEvents(orgWide, filter);
  const query = scopeProjectId ? projectQuery : orgQuery;

  const events = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = query.data ? Math.max(1, query.data.totalPages) : 1;
  const filtersActive =
    state.status !== "" || state.priority !== "" || state.search !== "" || state.range !== "7d";

  // The detail route resolves an event through a project's scope. When a
  // specific project is selected that's the anchor; org-wide, the current
  // dashboard project anchors it (the backend still checks org membership).
  const detailProject = projectsById.get(scopeProjectId || project.id) ?? project;

  function eventHref(event: TenantEvent): string {
    return `/app/${organization.slug}/${detailProject.slug}/events/${event.id}`;
  }

  return (
    <div className="events-page">
      <header className="events-page__heading">
        <p className="events-page__eyebrow">Operate</p>
        <div className="events-page__heading-row">
          <div>
            <h1>Events</h1>
            <span>
              Every notification request received, by project — status, priority, and fan-out at a
              glance.
            </span>
          </div>
          <span className="events-page__live" title="Refreshes automatically">
            <span className="events-page__live-dot" aria-hidden />
            {query.data ? `${total.toLocaleString()} events` : "Counting…"}
          </span>
        </div>
      </header>

      <div className="events-page__scope">
        <span className="events-page__scope-mark" aria-hidden>
          <CaretRight size={16} weight="bold" />
        </span>
        <span className="events-page__scope-text">
          <small>{wantsAllProjects ? "Scope" : "Project"}</small>
          <strong>{wantsAllProjects ? "All projects" : project.name}</strong>
        </span>
        {canReadOrganization ? (
          <AppSelect
            aria-label="Project scope"
            containerClassName="events-page__scope-select"
            value={wantsAllProjects ? "all" : scopeProjectId}
            onValueChange={(value) => patch({ project: value === project.id ? "" : value })}
            options={[
              { value: "all", label: "All projects" },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        ) : null}
      </div>

      <div className="events-page__filters">
        <span className="events-page__chipset">
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.value || "all"}
              type="button"
              data-active={state.status === chip.value || undefined}
              onClick={() => patch({ status: chip.value })}
            >
              {chip.label}
            </button>
          ))}
        </span>
        <AppSelect
          aria-label="Priority"
          value={state.priority}
          onValueChange={(value) => patch({ priority: value as EventPriority | "" })}
          options={PRIORITY_OPTIONS}
        />
        <span className="events-page__chipset">
          {RANGE_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              data-active={state.range === chip.value || undefined}
              onClick={() => patch({ range: chip.value })}
            >
              {chip.label}
            </button>
          ))}
        </span>
      </div>

      <input
        className="events-page__search"
        type="search"
        value={state.search}
        placeholder="Search event type…"
        onChange={(event) => patch({ search: event.target.value })}
      />

      <div className="events-page__table">
        <div className="events-page__table-head">
          <div>
            <h2>Event log</h2>
            <p>Newest first{state.range === "all" ? "" : `, last ${state.range}`}.</p>
          </div>
          <span className="events-page__count">{total.toLocaleString()}</span>
        </div>
        <div className="events-page__twrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Recipients</th>
                <th>Priority</th>
                <th>Status</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const badgeStatus =
                  event.hasFailures && event.status === "completed"
                    ? "partially_failed"
                    : event.status;
                return (
                  <tr
                    key={event.id}
                    className="events-page__row"
                    tabIndex={0}
                    role="link"
                    onClick={() => router.push(eventHref(event))}
                    onKeyDown={(keyEvent) => {
                      if (keyEvent.key === "Enter") router.push(eventHref(event));
                    }}
                  >
                    <td className="events-page__time">{relativeTime(event.createdAt)}</td>
                    <td>
                      <div className="events-page__etype">{event.eventType}</div>
                      <div className="events-page__eid">{event.id.slice(0, 18)}…</div>
                    </td>
                    <td className="events-page__num">{event.recipientCount.toLocaleString()}</td>
                    <td>
                      <span className="events-page__prio" data-p={event.priority}>
                        {event.priority}
                      </span>
                    </td>
                    <td>
                      <span className="events-page__badge" data-tone={statusTone(badgeStatus)}>
                        <span className="events-page__badge-dot" aria-hidden />
                        {STATUS_LABEL[badgeStatus] ?? badgeStatus}
                      </span>
                    </td>
                    <td className="events-page__chev">
                      <CaretRight size={13} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {events.length === 0 ? (
          <p className="events-page__empty">
            {query.isPending
              ? "Loading…"
              : filtersActive
                ? "No events match these filters."
                : "No events received yet."}
          </p>
        ) : null}
        {total > 0 ? (
          <div className="events-page__pager">
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
