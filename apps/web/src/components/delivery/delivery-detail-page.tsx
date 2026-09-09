"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowClockwise,
  ArrowLeft,
  ArrowSquareOut,
  Code,
  Eye,
  PaperPlaneTilt,
  Trash,
} from "@phosphor-icons/react";
import type { NotificationStatus, Organization, Project } from "@beaco/control-plane";
import {
  useDiscardProjectNotification,
  useProjectNotification,
  useRetryProjectNotification,
} from "@beaco/control-plane/react";
import { AppDialog, DialogAction } from "@/components/ui/app-dialog";
import { useToast } from "@/components/ui/toast";
import { absoluteFormatter } from "@/lib/audit-log";
import "./delivery-detail-page.css";

type DeliveryDetailPageProps = Readonly<{
  organization: Organization;
  project: Project;
  notificationId: string;
}>;

function statusTone(status: NotificationStatus): "success" | "danger" | "warning" | "muted" {
  if (status === "delivered") return "success";
  if (status === "failed" || status === "dead_letter") return "danger";
  if (status === "queued" || status === "processing") return "warning";
  return "muted";
}

function formattedJson(value: Record<string, unknown> | null): string {
  return value ? JSON.stringify(value, null, 2) : "No provider response recorded.";
}

/** Notification detail with attempt history, provider evidence, content, and source event. */
export function DeliveryDetailPage({
  organization,
  project,
  notificationId,
}: DeliveryDetailPageProps) {
  const toast = useToast();
  const [previewMode, setPreviewMode] = useState<"preview" | "source">("preview");
  const [recoveryAction, setRecoveryAction] = useState<"retry" | "discard" | null>(null);
  const query = useProjectNotification(project.id, notificationId);
  const retryNotification = useRetryProjectNotification();
  const discardNotification = useDiscardProjectNotification();
  const capabilities = useMemo(
    () => new Set(organization.capabilities),
    [organization.capabilities],
  );
  const canRecover = capabilities.has("project:deliveries:manage");
  const deliveryHref = `/app/${organization.slug}/${project.slug}/delivery`;

  async function handleRecovery() {
    if (!recoveryAction) return;
    const mutation = recoveryAction === "retry" ? retryNotification : discardNotification;
    try {
      await mutation.mutateAsync({ projectId: project.id, notificationId });
      toast.success(
        recoveryAction === "retry" ? "Delivery queued for retry" : "Delivery discarded",
      );
      setRecoveryAction(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update this delivery");
    }
  }

  if (query.isPending || query.isError || !query.data) {
    return (
      <div className="delivery-detail">
        <Link href={deliveryHref} className="delivery-detail__back">
          <ArrowLeft size={13} />
          All deliveries
        </Link>
        <p className="delivery-detail__empty">
          {query.isPending
            ? "Loading delivery…"
            : query.error instanceof Error
              ? query.error.message
              : "Delivery not found."}
        </p>
      </div>
    );
  }

  const notification = query.data;
  const eventHref = `/app/${organization.slug}/${project.slug}/events/${notification.eventId}`;
  return (
    <div className="delivery-detail">
      <Link href={deliveryHref} className="delivery-detail__back">
        <ArrowLeft size={13} />
        All deliveries
      </Link>

      <header className="delivery-detail__heading">
        <div>
          <p>{notification.channel} delivery</p>
          <h1>{notification.renderedSubject || notification.eventType}</h1>
          <span>
            {notification.id} · {absoluteFormatter.format(new Date(notification.createdAt))}
          </span>
        </div>
        <div className="delivery-detail__heading-actions">
          {notification.deadLetterStatus === "active" && canRecover ? (
            <div className="delivery-detail__recovery-actions">
              <button type="button" onClick={() => setRecoveryAction("discard")}>
                <Trash size={13} />
                Discard
              </button>
              <button type="button" data-primary onClick={() => setRecoveryAction("retry")}>
                <ArrowClockwise size={13} />
                Retry delivery
              </button>
            </div>
          ) : null}
          <span className="delivery-detail__status" data-tone={statusTone(notification.status)}>
            <i />
            {notification.status.replace("_", " ")}
          </span>
        </div>
      </header>

      <section className="delivery-detail__facts">
        <div>
          <small>Recipient</small>
          <strong>{notification.recipientAddress}</strong>
        </div>
        <div>
          <small>Attempts</small>
          <strong>
            {notification.retryCount + 1} / {notification.maxRetries + 1}
          </strong>
        </div>
        <div>
          <small>Priority</small>
          <strong>{notification.priority}</strong>
        </div>
        <div>
          <small>Next retry</small>
          <strong>
            {notification.nextRetryAt
              ? absoluteFormatter.format(new Date(notification.nextRetryAt))
              : "—"}
          </strong>
        </div>
      </section>

      <div className="delivery-detail__split">
        <section className="delivery-detail__card">
          <header>
            <div>
              <p>Trace</p>
              <h2>Delivery timeline</h2>
            </div>
            <span>{notification.logs.length} transitions</span>
          </header>
          <div className="delivery-detail__timeline">
            {notification.logs.length ? (
              notification.logs.map((log, index) => (
                <article key={log.id}>
                  <span
                    className="delivery-detail__node"
                    data-tone={statusTone(log.newStatus as NotificationStatus)}
                  >
                    {index + 1}
                  </span>
                  <div>
                    <strong>{log.newStatus.replace("_", " ")}</strong>
                    <time>{absoluteFormatter.format(new Date(log.createdAt))}</time>
                    {log.errorMessage ? <p>{log.errorMessage}</p> : null}
                    {log.workerId ? <small>Worker {log.workerId}</small> : null}
                  </div>
                </article>
              ))
            ) : (
              <p className="delivery-detail__empty-inline">
                No state transitions have been recorded.
              </p>
            )}
          </div>
        </section>

        <aside className="delivery-detail__side">
          <section className="delivery-detail__card">
            <header>
              <div>
                <p>Origin</p>
                <h2>Source event</h2>
              </div>
            </header>
            <div className="delivery-detail__source">
              <strong>{notification.eventType}</strong>
              <code>{notification.eventId}</code>
              <Link href={eventHref}>
                Open event <ArrowSquareOut size={13} />
              </Link>
            </div>
          </section>
          <section className="delivery-detail__card">
            <header>
              <div>
                <p>Provider</p>
                <h2>Last response</h2>
              </div>
            </header>
            <pre>{formattedJson(notification.providerResponse)}</pre>
          </section>
        </aside>
      </div>

      {notification.errorMessage ? (
        <section className="delivery-detail__error">
          <small>Last error</small>
          <strong>{notification.errorMessage}</strong>
        </section>
      ) : null}

      <section className="delivery-detail__card delivery-detail__message">
        <header>
          <div>
            <p>Rendered output</p>
            <h2>Message body</h2>
          </div>
          <div className="delivery-detail__tabs">
            <button
              type="button"
              data-active={previewMode === "preview" || undefined}
              onClick={() => setPreviewMode("preview")}
            >
              <Eye size={13} />
              Preview
            </button>
            <button
              type="button"
              data-active={previewMode === "source" || undefined}
              onClick={() => setPreviewMode("source")}
            >
              <Code size={13} />
              Source
            </button>
          </div>
        </header>
        {previewMode === "preview" && notification.channel === "email" ? (
          <iframe
            title="Rendered notification preview"
            sandbox=""
            srcDoc={notification.renderedBody ?? ""}
          />
        ) : (
          <pre className="delivery-detail__body">
            <PaperPlaneTilt size={15} />
            {notification.renderedBody || "No rendered body recorded."}
          </pre>
        )}
      </section>

      <AppDialog
        open={recoveryAction !== null}
        onOpenChange={(open) => {
          if (!open && !retryNotification.isPending && !discardNotification.isPending) {
            setRecoveryAction(null);
          }
        }}
        eyebrow="Dead letter"
        title={recoveryAction === "retry" ? "Retry this delivery?" : "Discard this delivery?"}
        description={
          recoveryAction === "retry"
            ? "Beaco will return this notification to the delivery queue and make another provider attempt."
            : "Beaco will mark this dead letter as discarded. It will remain in the delivery record for audit history."
        }
        busy={retryNotification.isPending || discardNotification.isPending}
        footer={
          <>
            <DialogAction
              disabled={retryNotification.isPending || discardNotification.isPending}
              onClick={() => setRecoveryAction(null)}
            >
              Cancel
            </DialogAction>
            <DialogAction
              tone={recoveryAction === "discard" ? "danger" : "primary"}
              disabled={retryNotification.isPending || discardNotification.isPending}
              onClick={handleRecovery}
            >
              {recoveryAction === "retry" ? <ArrowClockwise size={15} /> : <Trash size={15} />}
              {retryNotification.isPending || discardNotification.isPending
                ? "Working"
                : recoveryAction === "retry"
                  ? "Retry delivery"
                  : "Discard"}
            </DialogAction>
          </>
        }
      />
    </div>
  );
}
