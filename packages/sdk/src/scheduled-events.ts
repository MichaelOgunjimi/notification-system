import { mapRecipient } from "./events";
import { type ApiPage, HttpClient, mapPage, query } from "./http";
import { CreateScheduledEventInputSchema } from "./schemas";
import type {
  CreateScheduledEventInput,
  EventPriority,
  Page,
  RequestOptions,
  ScheduledEvent,
  ScheduledEventListOptions,
  ScheduledEventStatus,
} from "./types";

type ApiScheduledEvent = {
  id: string;
  api_key_id: string;
  event_type: string;
  scheduled_for: string;
  priority: EventPriority;
  status: ScheduledEventStatus;
  event_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapScheduledEvent(value: ApiScheduledEvent): ScheduledEvent {
  return {
    id: value.id,
    apiKeyId: value.api_key_id,
    eventType: value.event_type,
    scheduledFor: value.scheduled_for,
    priority: value.priority,
    status: value.status,
    eventId: value.event_id,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

/** Creates, lists, and cancels deferred events. */
export class ScheduledEventsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Schedules an event for future delivery.
   * @param input Event content and future delivery time.
   * @param options Optional cancellation signal.
   * @returns The created scheduled event.
   * @throws A `BeacoError` when validation or the request fails.
   */
  async create(
    input: CreateScheduledEventInput,
    options: RequestOptions = {},
  ): Promise<ScheduledEvent> {
    input = CreateScheduledEventInputSchema.parse(input);
    const value = await this.http.request<ApiScheduledEvent>("/scheduled-events", {
      method: "POST",
      body: {
        event_type: input.eventType,
        recipients: input.recipients.map(mapRecipient),
        scheduled_for:
          input.scheduledFor instanceof Date
            ? input.scheduledFor.toISOString()
            : input.scheduledFor,
        priority: input.priority,
        template_id: input.templateId,
        payload: input.payload,
        metadata: input.metadata,
      },
      signal: options.signal,
    });
    return mapScheduledEvent(value);
  }

  /**
   * Lists scheduled events visible to the configured project API key.
   * @param options Filters, pagination, and optional cancellation signal.
   * @returns One page of scheduled events.
   * @throws A `BeacoError` when the request fails.
   */
  async list(options: ScheduledEventListOptions = {}): Promise<Page<ScheduledEvent>> {
    const page = await this.http.request<ApiPage<ApiScheduledEvent>>(
      `/scheduled-events${query(options)}`,
      { signal: options.signal },
    );
    return mapPage(page, mapScheduledEvent);
  }

  /**
   * Cancels a pending scheduled event.
   * @param id Scheduled-event identifier.
   * @param options Optional cancellation signal.
   * @returns Nothing after successful cancellation.
   * @throws A `BeacoError` when the event cannot be cancelled or the request fails.
   */
  async cancel(id: string, options: RequestOptions = {}): Promise<void> {
    await this.http.request<void>(`/scheduled-events/${id}`, {
      method: "DELETE",
      signal: options.signal,
    });
  }
}
