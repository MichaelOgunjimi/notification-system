import type {
  NotificationChannel,
  ScheduledDisplayStatus,
  TenantScheduledEvent,
} from "@beaco/control-plane";

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
 * Picks the badge tone for a display status.
 *
 * @param status Display status from {@link scheduledDisplayStatus}.
 * @returns The tone used for the badge colours.
 */
export function scheduledStatusTone(status: ScheduledDisplayStatus): StatusTone {
  return TONE[status];
}

/**
 * Status filter chips. Each is a displayed status, filtered by the API, so a chip only ever
 * contains rows carrying its own label.
 */
export const SCHEDULED_STATUS_FILTERS: ReadonlyArray<{
  value: ScheduledDisplayStatus | "";
  label: string;
}> = [
  { value: "", label: "All" },
  { value: "pending", label: SCHEDULED_STATUS_LABEL.pending },
  { value: "dispatched", label: SCHEDULED_STATUS_LABEL.dispatched },
  { value: "completed", label: SCHEDULED_STATUS_LABEL.completed },
  { value: "partially_failed", label: SCHEDULED_STATUS_LABEL.partially_failed },
  { value: "delivery_failed", label: SCHEDULED_STATUS_LABEL.delivery_failed },
  { value: "failed", label: SCHEDULED_STATUS_LABEL.failed },
  { value: "expired", label: SCHEDULED_STATUS_LABEL.expired },
  { value: "cancelled", label: SCHEDULED_STATUS_LABEL.cancelled },
];

/**
 * Parses a status filter from a URL parameter.
 *
 * @param value Raw query-string value.
 * @returns A known filter value, or an empty string for "all".
 */
export function parseScheduledStatusFilter(value: string | null): ScheduledDisplayStatus | "" {
  return SCHEDULED_STATUS_FILTERS.some((chip) => chip.value !== "" && chip.value === value)
    ? (value as ScheduledDisplayStatus)
    : "";
}

/**
 * Describes the list order for a filter: the pending chip is a "next up" queue, every other view
 * reads latest first. The API applies the same rule.
 *
 * @param status The active status filter, or an empty string for all.
 * @returns A short caption for the table header.
 */
export function scheduledOrderCaption(status: ScheduledDisplayStatus | ""): string {
  return status === "pending" ? "Soonest first." : "Latest scheduled time first.";
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
