"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Prohibit } from "@phosphor-icons/react";
import type { Organization, Project } from "@beaco/control-plane";
import { useProjectScheduledEvent } from "@beaco/control-plane/react";
import { Skeleton } from "@/components/ui/skeleton";
import { absoluteFormatter, relativeTime } from "@/lib/audit-log";
import { formatBytes } from "@/lib/format-bytes";
import {
  SCHEDULED_STATUS_LABEL,
  canCancelScheduledEvent,
  scheduledDisplayStatus,
  scheduledStatusTone,
} from "@/lib/scheduled-events";
import { CancelScheduledEventDialog } from "./cancel-scheduled-event-dialog";
import "./scheduled-event-detail-page.css";

/** Props for {@link ScheduledEventDetailPage}. */
type ScheduledEventDetailPageProps = Readonly<{
  organization: Organization;
  project: Project;
  scheduledEventId: string;
}>;

function ScheduledEventDetailSkeleton({ backHref }: Readonly<{ backHref: string }>) {
  return (
    <div className="scheduled-detail scheduled-detail--skeleton" aria-busy="true" role="status">
      <Link href={backHref} className="scheduled-detail__back">
        <ArrowLeft size={13} />
        All scheduled events
      </Link>
      <span className="sr-only">Loading scheduled event</span>
      <header className="scheduled-detail__head" aria-hidden="true">
        <div>
          <Skeleton className="scheduled-detail__skeleton-title" />
          <Skeleton className="scheduled-detail__skeleton-meta" />
        </div>
      </header>
      <section className="scheduled-detail__card" aria-hidden="true">
        <h2>Schedule</h2>
        <div className="scheduled-detail__mgrid">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="scheduled-detail__mcell scheduled-detail__skeleton-cell" key={index}>
              <Skeleton />
              <Skeleton />
            </div>
          ))}
        </div>
      </section>
      <section className="scheduled-detail__card" aria-hidden="true">
        <h2>Recipients</h2>
        <div className="scheduled-detail__skeleton-table">
          {Array.from({ length: 2 }, (_, index) => (
            <Skeleton key={index} />
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * One scheduled event: when it is due, where it stands, why it failed (if it did), who it goes
 * to, its content source, and payload. Pending events can be cancelled from here.
 *
 * @param props Active organization and project, and the scheduled event to show.
 * @returns The scheduled event detail surface.
 */
export function ScheduledEventDetailPage({
  organization,
  project,
  scheduledEventId,
}: ScheduledEventDetailPageProps) {
  const query = useProjectScheduledEvent(project.id, scheduledEventId);
  const [cancelling, setCancelling] = useState(false);
  const backHref = `/app/${organization.slug}/${project.slug}/scheduled-events`;
  const canManage = new Set(organization.capabilities).has("project:deliveries:manage");

  if (query.isPending) {
    return <ScheduledEventDetailSkeleton backHref={backHref} />;
  }

  if (query.isError || !query.data) {
    return (
      <div className="scheduled-detail">
        <Link href={backHref} className="scheduled-detail__back">
          <ArrowLeft size={13} />
          All scheduled events
        </Link>
        <p className="scheduled-detail__empty" role="alert">
          {query.error instanceof Error ? query.error.message : "Scheduled event not found."}
        </p>
      </div>
    );
  }

  const event = query.data;
  const display = scheduledDisplayStatus(event);
  const tone = scheduledStatusTone(display);
  const eventHref = event.eventId
    ? `/app/${organization.slug}/${project.slug}/events/${event.eventId}`
    : null;

  return (
    <div className="scheduled-detail" aria-busy={query.isFetching || undefined}>
      <Link href={backHref} className="scheduled-detail__back">
        <ArrowLeft size={13} />
        All scheduled events
      </Link>

      <header className="scheduled-detail__head">
        <div>
          <div className="scheduled-detail__title-row">
            <h1>{event.eventType}</h1>
            <span className="scheduled-detail__badge" data-tone={tone}>
              <span className="scheduled-detail__badge-dot" aria-hidden />
              {SCHEDULED_STATUS_LABEL[display]}
            </span>
          </div>
          <div className="scheduled-detail__meta">
            <span>{event.id}</span>
            <span>·</span>
            <span>
              {absoluteFormatter.format(new Date(event.scheduledFor))} (
              {relativeTime(event.scheduledFor)})
            </span>
          </div>
        </div>
        <div className="scheduled-detail__head-actions">
          <span className="scheduled-detail__prio-tag">{event.priority} priority</span>
          {canManage && canCancelScheduledEvent(event) ? (
            <button
              type="button"
              className="scheduled-detail__cancel"
              onClick={() => setCancelling(true)}
            >
              <Prohibit size={14} />
              Cancel event
            </button>
          ) : null}
        </div>
      </header>

      {event.failureReason ? (
        <section className="scheduled-detail__reason" role="note" data-tone={tone}>
          <h2>{display === "expired" ? "Why it expired" : "Why it failed"}</h2>
          <p>{event.failureReason}</p>
        </section>
      ) : null}

      <section className="scheduled-detail__card">
        <h2>Schedule</h2>
        <div className="scheduled-detail__mgrid">
          <div className="scheduled-detail__mcell">
            <p className="k">Scheduled for</p>
            <p className="v">{absoluteFormatter.format(new Date(event.scheduledFor))}</p>
          </div>
          <div className="scheduled-detail__mcell">
            <p className="k">Created</p>
            <p className="v">{absoluteFormatter.format(new Date(event.createdAt))}</p>
          </div>
          <div className="scheduled-detail__mcell">
            <p className="k">Status</p>
            <p className="v mono">{event.status}</p>
          </div>
          <div className="scheduled-detail__mcell">
            <p className="k">Last updated</p>
            <p className="v">{absoluteFormatter.format(new Date(event.updatedAt))}</p>
          </div>
          <div className="scheduled-detail__mcell">
            <p className="k">API key</p>
            <p className="v mono">
              {event.apiKeyName} · {event.apiKeyEnvironment}
            </p>
          </div>
          <div className="scheduled-detail__mcell">
            <p className="k">Resulting event</p>
            <p className="v mono">
              {eventHref && event.eventId ? (
                <Link href={eventHref} className="scheduled-detail__link">
                  {event.eventId}
                </Link>
              ) : (
                "—"
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="scheduled-detail__card">
        <h2>Content</h2>
        <div className="scheduled-detail__mgrid">
          <div className="scheduled-detail__mcell">
            <p className="k">Source</p>
            <p className="v">{event.contentSource === "inline" ? "Inline email" : "Template"}</p>
          </div>
          <div className="scheduled-detail__mcell">
            <p className="k">{event.contentSource === "inline" ? "Subject" : "Template"}</p>
            <p className="v mono">
              {event.contentSource === "inline"
                ? (event.subject ?? "—")
                : (event.templateName ?? event.templateId ?? "—")}
            </p>
          </div>
        </div>
      </section>

      {event.attachments.length > 0 ? (
        <section className="scheduled-detail__card">
          <h2>
            Attachments <span>{event.attachments.length}</span>
          </h2>
          <div className="scheduled-detail__mgrid">
            {event.attachments.map((attachment) => (
              <div key={attachment.filename} className="scheduled-detail__mcell">
                <p className="k">{formatBytes(attachment.sizeBytes)}</p>
                <p className="v mono">{attachment.filename}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="scheduled-detail__card">
        <h2>
          Recipients <span>{event.recipientCount}</span>
        </h2>
        {event.recipients.length === 0 ? (
          <p className="scheduled-detail__empty-inline">No recipients.</p>
        ) : (
          <div className="scheduled-detail__twrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Channels</th>
                  <th>Addresses</th>
                </tr>
              </thead>
              <tbody>
                {event.recipients.map((recipient, index) => (
                  <tr key={`${recipient.userId ?? "anonymous"}-${index}`}>
                    <td className="mono">{recipient.userId ?? "—"}</td>
                    <td>{recipient.channels.join(" · ")}</td>
                    <td className="mono">{recipient.addresses.join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="scheduled-detail__card">
        <h2>Payload</h2>
        <pre className="scheduled-detail__payload">{JSON.stringify(event.payload, null, 2)}</pre>
      </section>

      <CancelScheduledEventDialog
        event={cancelling ? event : null}
        projectId={project.id}
        onClose={() => setCancelling(false)}
      />
    </div>
  );
}
