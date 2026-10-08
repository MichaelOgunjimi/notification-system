import type {
  NotificationChannel,
  ScheduledEventStatus,
  TenantScheduledEvent,
} from "@beaco/control-plane";

/** What the dashboard shows for a scheduled event once its linked event is taken into account. */
export type ScheduledDisplayStatus =
  | "pending"
  | "dispatched"
  | "completed"
  | "partially_failed"
  | "delivery_failed"
  | "failed"
  | "expired"
  | "cancelled";

/** Visual tone of a status badge. */
export type StatusTone = "success" | "danger" | "warning" | "muted";

/** Labels for every {@link ScheduledDisplayStatus}. */
export const SCHEDULED_STATUS_LABEL: Readonly<Record<ScheduledDisplayStatus, string>> = {
  pending: "Pending",
  dispatched: "Dispatched",
  completed: "Completed",
  partially_failed: "Partially failed",
  delivery_failed: "Delivery failed",
  failed: "Failed",
  expired: "Expired",
  cancelled: "Cancelled",
};

const TONE: Readonly<Record<ScheduledDisplayStatus, StatusTone>> = {
  pending: "warning",
  dispatched: "warning",
  completed: "success",
  partially_failed: "warning",
  delivery_failed: "danger",
  failed: "danger",
  expired: "danger",
  cancelled: "muted",
};

/**
 * Resolves the status to display for a scheduled event.
 *
 * The API row only knows it was `dispatched`; the linked event says whether the
 * delivery then finished, so a dispatched row shows the outcome once it is known.
 * `processing` is reserved and never produced by the dispatcher, so it reads as pending.
 *
 * @param event A scheduled event from the list or detail endpoint.
 * @returns The display status.
 */
export function scheduledDisplayStatus(
  event: Pick<TenantScheduledEvent, "status" | "eventStatus">,
): ScheduledDisplayStatus {
  switch (event.status) {
    case "pending":
    case "processing":
      return "pending";
    case "dispatched":
      if (event.eventStatus === "completed") return "completed";
      if (event.eventStatus === "partially_failed") return "partially_failed";
      if (event.eventStatus === "failed") return "delivery_failed";
      return "dispatched";
    default:
      return event.status;
  }
}

/**
 * Picks the badge tone for a display status.
 *
 * @param status Display status from {@link scheduledDisplayStatus}.
 * @returns The tone used for the badge colours.
 */
export function scheduledStatusTone(status: ScheduledDisplayStatus): StatusTone {
  return TONE[status];
}

/** Status filter chips. `Dispatched` includes events whose delivery has since completed. */
export const SCHEDULED_STATUS_FILTERS: ReadonlyArray<{
  value: ScheduledEventStatus | "";
  label: string;
}> = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "dispatched", label: "Dispatched" },
  { value: "failed", label: "Failed" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

/**
 * Parses a status filter from a URL parameter.
 *
 * @param value Raw query-string value.
 * @returns A known filter value, or an empty string for "all".
 */
export function parseScheduledStatusFilter(value: string | null): ScheduledEventStatus | "" {
  return SCHEDULED_STATUS_FILTERS.some((chip) => chip.value !== "" && chip.value === value)
    ? (value as ScheduledEventStatus)
    : "";
}

/**
 * Whether the cancel action applies. Only pending events can be cancelled; later states are final.
 *
 * @param event A scheduled event.
 * @returns True while the event is still waiting for its scheduled time.
 */
export function canCancelScheduledEvent(event: Pick<TenantScheduledEvent, "status">): boolean {
  return event.status === "pending";
}

/**
 * Summarises who an event goes to in one line, e.g. `a@example.com +2 more`.
 *
 * @param event A scheduled event from the list endpoint.
 * @returns The summary, or `No recipients` for an empty event.
 */
export function recipientSummary(
  event: Pick<TenantScheduledEvent, "firstRecipient" | "recipientCount">,
): string {
  if (event.recipientCount === 0) return "No recipients";
  const first = event.firstRecipient ?? `${event.recipientCount} recipients`;
  const others = event.recipientCount - 1;
  return event.firstRecipient && others > 0 ? `${first} +${others} more` : first;
}

/**
 * Joins channel names for display, e.g. `email · sms`.
 *
 * @param channels Distinct channels across an event's recipients.
 * @returns The joined list, or an em dash when empty.
 */
export function channelList(channels: readonly NotificationChannel[]): string {
  return channels.length > 0 ? channels.join(" · ") : "—";
}
