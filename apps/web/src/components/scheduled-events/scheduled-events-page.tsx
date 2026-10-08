"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, CaretRight } from "@phosphor-icons/react";
import type {
  Organization,
  Project,
  ScheduledDisplayStatus,
  TenantScheduledEvent,
} from "@beaco/control-plane";
import { useProjectScheduledEvents } from "@beaco/control-plane/react";
import { Skeleton } from "@/components/ui/skeleton";
import { TablePager } from "@/components/ui/table-pager";
import { useRememberedSearchParams } from "@/components/ui/use-remembered-search-params";
import { absoluteFormatter, relativeTime } from "@/lib/audit-log";
import {
  SCHEDULED_STATUS_FILTERS,
  SCHEDULED_STATUS_LABEL,
  canCancelScheduledEvent,
  channelList,
  parseScheduledStatusFilter,
  recipientSummary,
  scheduledOrderCaption,
  scheduledStatusTone,
} from "@/lib/scheduled-events";
import { CancelScheduledEventDialog } from "./cancel-scheduled-event-dialog";
import "./scheduled-motion.css";
import "./scheduled-events-page.css";

/** Props for {@link ScheduledEventsPage}. */
type ScheduledEventsPageProps = Readonly<{
  organization: Organization;
  project: Project;
}>;

const PER_PAGE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_PER_PAGE = PER_PAGE_OPTIONS[0];

type ScheduledUrlState = Readonly<{
  status: ScheduledDisplayStatus | "";
  page: number;
  perPage: number;
}>;

function useScheduledUrlState(): {
  state: ScheduledUrlState;
  patch: (next: Partial<ScheduledUrlState>) => void;
} {
  const { params, replace } = useRememberedSearchParams();

  const state = useMemo<ScheduledUrlState>(() => {
    const perPage = Number(params.get("perPage"));
    return {
      status: parseScheduledStatusFilter(params.get("status")),
      page: Math.max(1, Number(params.get("page")) || 1),
      perPage: (PER_PAGE_OPTIONS as readonly number[]).includes(perPage)
        ? perPage
        : DEFAULT_PER_PAGE,
    };
  }, [params]);

  function patch(next: Partial<ScheduledUrlState>) {
    const merged = { ...state, ...next };
    if (next.page === undefined) merged.page = 1;

    const search = new URLSearchParams();
    if (merged.status) search.set("status", merged.status);
    if (merged.page > 1) search.set("page", String(merged.page));
    if (merged.perPage !== DEFAULT_PER_PAGE) search.set("perPage", String(merged.perPage));
    replace(search);
  }

  return { state, patch };
}

/**
 * The project's scheduled events: when each is due, who it goes to, where it stands, and why
 * it failed or expired. Rows open a detail view; pending rows can be cancelled by members who
 * may manage deliveries. Scheduling itself happens through the API and SDKs.
 *
 * @param props Active organization and project.
 * @returns The scheduled events surface.
 */
export function ScheduledEventsPage({ organization, project }: ScheduledEventsPageProps) {
  const router = useRouter();
  const { state, patch } = useScheduledUrlState();
  const [cancelTarget, setCancelTarget] = useState<TenantScheduledEvent | null>(null);
  const canManage = useMemo(
    () => new Set(organization.capabilities).has("project:deliveries:manage"),
    [organization.capabilities],
  );

  const query = useProjectScheduledEvents(project.id, {
    page: state.page,
    perPage: state.perPage,
    status: state.status || undefined,
  });

  const events = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = query.data ? Math.max(1, query.data.totalPages) : 1;

  const scheduleHref = `/app/${organization.slug}/${project.slug}/scheduled-events/new`;

  function eventHref(event: TenantScheduledEvent): string {
    return `/app/${organization.slug}/${project.slug}/scheduled-events/${event.id}`;
  }

  return (
    <div className="scheduled-page">
      <header className="scheduled-page__heading scheduled-fade-in">
        <div>
          <p className="scheduled-page__eyebrow">Operate</p>
          <h1>Scheduled events</h1>
          <span>
            Events queued for a future time. Each becomes a normal event when it is due; one that
            could not be sent, or was missed by more than an hour, says why.
          </span>
        </div>
        {canManage ? (
          <Link href={scheduleHref} className="scheduled-page__schedule">
            <CalendarPlus size={15} />
            Schedule
          </Link>
        ) : null}
      </header>

      <div className="scheduled-page__filters scheduled-fade-in" style={{ "--i": 1 } as never}>
        <span className="scheduled-page__chipset">
          {SCHEDULED_STATUS_FILTERS.map((chip) => (
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
      </div>

      {query.isPending ? (
        <span className="sr-only" role="status">
          Loading scheduled events
        </span>
      ) : null}
      <div
        className="scheduled-page__table scheduled-fade-in"
        style={{ "--i": 2 } as never}
        aria-busy={query.isFetching || undefined}
      >
        <div className="scheduled-page__table-head">
          <div>
            <h2>Schedule</h2>
            <p>{scheduledOrderCaption(state.status)}</p>
          </div>
          <span className="scheduled-page__count" title="Refreshes automatically">
            <span className="scheduled-page__live-dot" aria-hidden />
            {query.data ? (
              `${total.toLocaleString()} scheduled`
            ) : (
              <Skeleton className="scheduled-page__count-skeleton" />
            )}
          </span>
        </div>
        <div className="scheduled-page__twrap">
          <table>
            <thead>
              <tr>
                <th>Scheduled for</th>
                <th>Event</th>
                <th>Recipients</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {query.isPending
                ? Array.from({ length: 6 }, (_, row) => (
                    <tr className="scheduled-page__skeleton-row" aria-hidden="true" key={row}>
                      {Array.from({ length: 5 }, (_, cell) => (
                        <td key={cell}>
                          <Skeleton />
                        </td>
                      ))}
                    </tr>
                  ))
                : null}
              {events.map((event, index) => {
                const display = event.displayStatus;
                return (
                  <tr
                    key={event.id}
                    className="scheduled-page__row scheduled-stagger-in"
                    style={{ "--i": Math.min(index, 10) } as never}
                    tabIndex={0}
                    role="link"
                    aria-label={`Open scheduled event ${event.eventType}`}
                    onClick={() => router.push(eventHref(event))}
                    onKeyDown={(keyEvent) => {
                      if (keyEvent.key === "Enter" && keyEvent.target === keyEvent.currentTarget) {
                        router.push(eventHref(event));
                      }
                    }}
                  >
                    <td className="scheduled-page__time">
                      <div>{absoluteFormatter.format(new Date(event.scheduledFor))}</div>
                      <div className="scheduled-page__relative">
                        {relativeTime(event.scheduledFor)}
                      </div>
                    </td>
                    <td>
                      <div className="scheduled-page__etype">{event.eventType}</div>
                      <div className="scheduled-page__eid">{event.id.slice(0, 18)}…</div>
                    </td>
                    <td>
                      <div className="scheduled-page__recipients">{recipientSummary(event)}</div>
                      <div className="scheduled-page__channels">{channelList(event.channels)}</div>
                    </td>
                    <td>
                      <span
                        className="scheduled-page__badge"
                        data-tone={scheduledStatusTone(display)}
                      >
                        <span
                          className="scheduled-page__badge-dot"
                          data-live={display === "dispatched" || undefined}
                          aria-hidden
                        />
                        {SCHEDULED_STATUS_LABEL[display]}
                      </span>
                      {event.failureReason ? (
                        <div className="scheduled-page__reason" title={event.failureReason}>
                          {event.failureReason}
                        </div>
                      ) : null}
                    </td>
                    <td className="scheduled-page__actions">
                      {canManage && canCancelScheduledEvent(event) ? (
                        <button
                          type="button"
                          className="scheduled-page__cancel"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            setCancelTarget(event);
                          }}
                        >
                          Cancel
                        </button>
                      ) : (
                        <CaretRight size={13} aria-hidden />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!query.isPending && events.length === 0 ? (
          <div className="scheduled-page__empty" role={query.isError ? "alert" : undefined}>
            <p>
              {query.isError
                ? query.error.message
                : state.status
                  ? "No scheduled events match this filter."
                  : "Nothing scheduled yet."}
            </p>
            {!query.isError && !state.status ? (
              <p className="scheduled-page__empty-hint">
                {canManage ? (
                  <>
                    <Link href={scheduleHref}>Schedule an event</Link> from here, or call{" "}
                    <code>POST /scheduled-events</code> from your app or an SDK.
                  </>
                ) : (
                  <>
                    Events are scheduled with <code>POST /scheduled-events</code> from your app or
                    an SDK.
                  </>
                )}
              </p>
            ) : null}
          </div>
        ) : null}
        {total > 0 ? (
          <div className="scheduled-page__pager">
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

      <CancelScheduledEventDialog
        event={cancelTarget}
        projectId={project.id}
        onClose={() => setCancelTarget(null)}
      />
    </div>
  );
}
