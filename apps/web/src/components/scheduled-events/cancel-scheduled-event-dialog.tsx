"use client";

import { Prohibit } from "@phosphor-icons/react";
import type { TenantScheduledEvent } from "@beaco/control-plane";
import { useCancelProjectScheduledEvent } from "@beaco/control-plane/react";
import { AppDialog, DialogAction } from "@/components/ui/app-dialog";
import { useToast } from "@/components/ui/toast";
import { absoluteFormatter } from "@/lib/audit-log";

/** Props for {@link CancelScheduledEventDialog}. */
type CancelScheduledEventDialogProps = Readonly<{
  /** The event to cancel, or `null` while the dialog is closed. */
  event: Pick<TenantScheduledEvent, "id" | "eventType" | "scheduledFor"> | null;
  projectId: string;
  onClose: () => void;
}>;

/**
 * Confirms and performs the cancellation of a pending scheduled event.
 *
 * The server decides whether the event is still pending, so a dispatcher that
 * got there first surfaces as an inline error rather than a silent no-op.
 *
 * @param props The event to cancel, its project, and a close callback.
 * @returns A modal confirmation dialog.
 * @sideEffects Sends a cancel request, refreshes the project's scheduled event caches, and
 *   shows a success toast.
 */
export function CancelScheduledEventDialog({
  event,
  projectId,
  onClose,
}: CancelScheduledEventDialogProps) {
  const toast = useToast();
  const cancel = useCancelProjectScheduledEvent();

  function handleCancel() {
    if (!event) return;
    cancel.mutate(
      { projectId, scheduledEventId: event.id },
      {
        onSuccess: () => {
          toast.success("Scheduled event cancelled");
          onClose();
        },
      },
    );
  }

  return (
    <AppDialog
      open={event !== null}
      onOpenChange={(open) => {
        if (!open && !cancel.isPending) {
          cancel.reset();
          onClose();
        }
      }}
      eyebrow="Scheduled event"
      title="Cancel this scheduled event?"
      description={
        event
          ? `${event.eventType} will not be sent at ${absoluteFormatter.format(new Date(event.scheduledFor))}. This cannot be undone.`
          : undefined
      }
      busy={cancel.isPending}
      footer={
        <>
          <DialogAction
            disabled={cancel.isPending}
            onClick={() => {
              cancel.reset();
              onClose();
            }}
          >
            Keep it
          </DialogAction>
          <DialogAction tone="danger" disabled={cancel.isPending} onClick={handleCancel}>
            <Prohibit size={15} />
            {cancel.isPending ? "Cancelling" : "Cancel event"}
          </DialogAction>
        </>
      }
    >
      {cancel.isError ? (
        <p className="app-dialog__error" role="alert">
          {cancel.error.message}
        </p>
      ) : null}
    </AppDialog>
  );
}
