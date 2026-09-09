"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import type { Organization, Project } from "@beaco/control-plane";
import { useProjectEvent } from "@beaco/control-plane/react";
import { absoluteFormatter } from "@/lib/audit-log";
import "./event-detail-page.css";

/** Props for {@link EventDetailPage}. */
type EventDetailPageProps = Readonly<{
  organization: Organization;
  project: Project;
  eventId: string;
}>;

const STATUS_LABEL: Record<string, string> = {
  accepted: "Accepted",
  processing: "Processing",
  completed: "Completed",
  partially_failed: "Partially failed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function statusTone(status: string): "success" | "danger" | "warning" | "muted" {
  if (status === "completed" || status === "delivered") return "success";
  if (status === "failed" || status === "dead_letter") return "danger";
  if (status === "processing" || status === "partially_failed" || status === "pending") {
    return "warning";
  }
  return "muted";
}

/**
 * One event's metadata, fan-out notifications, delivery timeline, and raw
 * payload.
 *
 * @param props Active organization and project, and the event to show.
 * @returns The event detail surface.
 */
export function EventDetailPage({ organization, project, eventId }: EventDetailPageProps) {
  const router = useRouter();
  const query = useProjectEvent(project.id, eventId);
  const backHref = `/app/${organization.slug}/${project.slug}/events`;

  if (query.isPending) {
    return (
      <div className="event-detail-page">
        <Link href={backHref} className="event-detail-page__back">
          <ArrowLeft size={13} />
          All events
        </Link>
        <p className="event-detail-page__empty">Loading…</p>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="event-detail-page">
        <Link href={backHref} className="event-detail-page__back">
          <ArrowLeft size={13} />
          All events
        </Link>
        <p className="event-detail-page__empty">
          {query.error instanceof Error ? query.error.message : "Event not found."}
        </p>
      </div>
    );
  }

  const event = query.data;
  function notificationHref(notificationId: string): string {
    return `/app/${organization.slug}/${project.slug}/delivery/${notificationId}`;
  }
  const timeline: ReadonlyArray<{ step: string; done: boolean }> = [
    { step: "Accepted", done: true },
    { step: "Processing", done: event.status !== "accepted" },
    {
      step: "Completed",
      done: event.status === "completed" || event.status === "partially_failed",
    },
  ];

  return (
    <div className="event-detail-page">
      <Link href={backHref} className="event-detail-page__back">
        <ArrowLeft size={13} />
        All events
      </Link>

      <header className="event-detail-page__head">
        <div>
          <div className="event-detail-page__title-row">
            <h1>{event.eventType}</h1>
            <span className="event-detail-page__badge" data-tone={statusTone(event.status)}>
              <span className="event-detail-page__badge-dot" aria-hidden />
              {STATUS_LABEL[event.status] ?? event.status}
            </span>
          </div>
          <div className="event-detail-page__meta">
            <span>{event.id}</span>
            <span>·</span>
            <span>{absoluteFormatter.format(new Date(event.createdAt))}</span>
          </div>
        </div>
        <span className="event-detail-page__prio-tag">{event.priority} priority</span>
      </header>

      <section className="event-detail-page__card">
        <h2>Metadata</h2>
        <div className="event-detail-page__mgrid">
          <div className="event-detail-page__mcell">
            <p className="k">Event ID</p>
            <p className="v mono">{event.id}</p>
          </div>
          <div className="event-detail-page__mcell">
            <p className="k">Event type</p>
            <p className="v mono">{event.eventType}</p>
          </div>
          <div className="event-detail-page__mcell">
            <p className="k">Priority</p>
            <p className="v">{event.priority}</p>
          </div>
          <div className="event-detail-page__mcell">
            <p className="k">Recipients</p>
            <p className="v">{event.recipientCount.toLocaleString()}</p>
          </div>
          <div className="event-detail-page__mcell">
            <p className="k">Status</p>
            <p className="v mono">{event.status}</p>
          </div>
          <div className="event-detail-page__mcell">
            <p className="k">API key</p>
            <p className="v mono">
              {event.apiKeyName} · {event.apiKeyEnvironment}
            </p>
          </div>
          <div className="event-detail-page__mcell">
            <p className="k">Idempotency key</p>
            <p className="v mono">{event.idempotencyKey ?? "—"}</p>
          </div>
          <div className="event-detail-page__mcell">
            <p className="k">Batch</p>
            <p className="v mono">{event.batchId ?? "—"}</p>
          </div>
        </div>
      </section>

      <section className="event-detail-page__card">
        <h2>
          Fan-out notifications <span>{event.notifications.length}</span>
        </h2>
        {event.notifications.length === 0 ? (
          <p className="event-detail-page__empty-inline">No notifications spawned yet.</p>
        ) : (
          <div className="event-detail-page__twrap">
            <table>
              <thead>
                <tr>
                  <th>Notification</th>
                  <th>Channel</th>
                  <th>Recipient</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {event.notifications.map((notification) => (
                  <tr
                    key={notification.id}
                    className="event-detail-page__notification-row"
                    tabIndex={0}
                    role="link"
                    aria-label={`Open ${notification.channel} delivery to ${notification.recipientAddress}`}
                    onClick={() => router.push(notificationHref(notification.id))}
                    onKeyDown={(keyEvent) => {
                      if (keyEvent.key === "Enter") {
                        router.push(notificationHref(notification.id));
                      }
                    }}
                  >
                    <td className="mono event-detail-page__notification-id">
                      {notification.id.slice(0, 18)}…
                    </td>
                    <td>{notification.channel}</td>
                    <td className="mono">{notification.recipientAddress}</td>
                    <td>
                      <span
                        className="event-detail-page__badge"
                        data-tone={statusTone(notification.status)}
                      >
                        <span className="event-detail-page__badge-dot" aria-hidden />
                        {STATUS_LABEL[notification.status] ?? notification.status}
                      </span>
                    </td>
                    <td className="event-detail-page__muted">
                      {absoluteFormatter.format(new Date(notification.createdAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="event-detail-page__card">
        <h2>Timeline</h2>
        <div className="event-detail-page__timeline">
          {timeline.map((step, index) => (
            <div key={step.step} className="event-detail-page__tstep">
              <div className="event-detail-page__tcol">
                <span
                  className="event-detail-page__knob"
                  data-done={step.done || undefined}
                  aria-hidden
                >
                  {step.done ? "✓" : "○"}
                </span>
                {index < timeline.length - 1 ? (
                  <span className="event-detail-page__rail" aria-hidden />
                ) : null}
              </div>
              <span className="event-detail-page__tlabel" data-done={step.done || undefined}>
                {step.step}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="event-detail-page__card">
        <h2>Payload</h2>
        <pre className="event-detail-page__payload">{JSON.stringify(event.payload, null, 2)}</pre>
      </section>
    </div>
  );
}
