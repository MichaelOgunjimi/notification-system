import { mapEventInput } from "./events";
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

/** @internal Converts a REST scheduled event to the public camelCase model. */
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
  /** @internal Creates scheduled-event operations over a shared authenticated transport. */
  constructor(private readonly http: HttpClient) {}

  /**
   * Schedules an event for future delivery. Takes the same content fields as `events.publish`
   * (exactly one of `templateId`, `templateName` or `inline`, plus optional `attachments`).
   * This operation stores deferred work; delivery is not attempted before `scheduledFor`.
   *
   * @param input - Event content, recipients, template data, and future delivery time.
   * @param options - Optional cancellation signal. Aborting it cancels the HTTP request.
   * @returns The created scheduled event.
   * @throws {ZodError} When `input` fails local schema validation.
   * @throws {BeacoError} When validation, authorization, or the API request fails.
   */
  async create(
    input: CreateScheduledEventInput,
    options: RequestOptions = {},
  ): Promise<ScheduledEvent> {
    input = CreateScheduledEventInputSchema.parse(input);
    const value = await this.http.request<ApiScheduledEvent>("/scheduled-events", {
      method: "POST",
      body: {
        ...mapEventInput(input),
        scheduled_for:
          input.scheduledFor instanceof Date
            ? input.scheduledFor.toISOString()
            : input.scheduledFor,
      },
      signal: options.signal,
    });
    return mapScheduledEvent(value);
  }

  /**
   * Lists scheduled events visible to the configured project API key.
   * @param options - Status filter, pagination, and an optional cancellation signal.
   * @returns One page of scheduled events and pagination metadata.
   * @throws {BeacoError} When the API rejects the request or cannot be reached.
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
   * Cancellation changes server state and is valid only before dispatch.
   *
   * @param id - Unique scheduled-event identifier.
   * @param options - Optional cancellation signal. Aborting it cancels the HTTP request.
   * @returns Nothing after successful cancellation.
   * @throws {BeacoError} When the event cannot be cancelled or the request cannot be completed.
   */
  async cancel(id: string, options: RequestOptions = {}): Promise<void> {
    await this.http.request<void>(`/scheduled-events/${id}`, {
      method: "DELETE",
      signal: options.signal,
    });
  }
}
