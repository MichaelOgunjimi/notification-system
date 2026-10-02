import { type ApiPage, HttpClient, mapPage, query } from "./http";
import { mapNotification, type ApiNotification } from "./notifications";
import { PublishEventInputSchema } from "./schemas";
import type {
  Event,
  EventDetail,
  EventListOptions,
  EventPriority,
  EventStatus,
  InlineEmail,
  Page,
  PublishEventInput,
  Recipient,
  RequestOptions,
} from "./types";

type ApiEvent = {
  id: string;
  event_type: string;
  priority: EventPriority;
  status: EventStatus;
  recipient_count: number;
  has_failures: boolean;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
};

type ApiEventDetail = ApiEvent & {
  template_id: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  batch_id: string | null;
  notifications: ApiNotification[];
};

/** @internal Converts one SDK recipient to the REST representation. */
export function mapRecipient(value: Recipient) {
  return {
    user_id: value.userId,
    channels: value.channels,
    email: value.email,
    phone: value.phone,
    webhook_url: value.webhookUrl,
  };
}

/** @internal Converts inline email content to the REST representation. */
function mapInline(value: InlineEmail) {
  return {
    subject: value.subject,
    html: value.html,
    text: value.text,
    from_local: value.fromLocal,
    from_name: value.fromName,
    reply_to: value.replyTo,
  };
}

/** @internal Converts one SDK event input to the REST representation. */
export function mapEventInput(value: PublishEventInput) {
  return {
    event_type: value.eventType,
    recipients: value.recipients.map(mapRecipient),
    priority: value.priority,
    template_id: value.templateId,
    template_name: value.templateName,
    inline: value.inline && mapInline(value.inline),
    payload: value.payload,
    metadata: value.metadata,
    idempotency_key: value.idempotencyKey,
  };
}

/** @internal Converts the REST event representation to the public camelCase model. */
function mapEvent(value: ApiEvent): Event {
  return {
    id: value.id,
    eventType: value.event_type,
    priority: value.priority,
    status: value.status,
    recipientCount: value.recipient_count,
    hasFailures: value.has_failures,
    idempotencyKey: value.idempotency_key,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

/** Publishes and queries Beaco events. */
export class EventsResource {
  /** @internal Creates event operations over a shared authenticated transport. */
  constructor(private readonly http: HttpClient) {}

  /**
   * Publishes one event for immediate notification fan-out.
   * This operation creates an event and may enqueue one notification per recipient channel.
   * Provide `idempotencyKey` when retries must not duplicate work.
   *
   * @param input - Event name, recipients, template data, and delivery controls.
   * @param options - Optional cancellation signal. Aborting it cancels the HTTP request.
   * @returns The event summary accepted by Beaco.
   * @throws {ZodError} When `input` fails local schema validation.
   * @throws {BeacoError} When the API rejects the request or cannot be reached.
   */
  async publish(input: PublishEventInput, options: RequestOptions = {}): Promise<Event> {
    input = PublishEventInputSchema.parse(input);
    const value = await this.http.request<ApiEvent>("/events", {
      method: "POST",
      body: mapEventInput(input),
      signal: options.signal,
    });
    return mapEvent(value);
  }

  /**
   * Publishes multiple events in one atomic API request.
   *
   * The API accepts or rejects the batch as a unit, so a failed request does not partially
   * create events.
   *
   * @param events - Non-empty event inputs using the same contract as {@link publish}.
   * @param options - Optional cancellation signal. Aborting it cancels the HTTP request.
   * @returns Accepted event summaries in the same order as `events`.
   * @throws {ZodError} When any event fails local schema validation.
   * @throws {BeacoError} When the API rejects the batch or cannot be reached.
   */
  async publishBatch(events: PublishEventInput[], options: RequestOptions = {}): Promise<Event[]> {
    const values = await this.http.request<ApiEvent[]>("/events/batch", {
      method: "POST",
      body: { events: events.map((event) => mapEventInput(PublishEventInputSchema.parse(event))) },
      signal: options.signal,
    });
    return values.map(mapEvent);
  }

  /**
   * Lists events visible to the configured project API key.
   * This read-only operation supports status, priority, event type, date, and pagination filters.
   *
   * @param options - Filters, pagination, and an optional cancellation signal.
   * @returns One page of event summaries and pagination metadata.
   * @throws {BeacoError} When the API rejects the request or cannot be reached.
   */
  async list(options: EventListOptions = {}): Promise<Page<Event>> {
    const page = await this.http.request<ApiPage<ApiEvent>>(`/events${query(options)}`, {
      signal: options.signal,
    });
    return mapPage(page, mapEvent);
  }

  /**
   * Retrieves one event and its generated notifications.
   * @param id - Event identifier returned by {@link publish} or {@link publishBatch}.
   * @param options - Optional cancellation signal. Aborting it cancels the HTTP request.
   * @returns Detailed event state, payload, metadata, and generated notifications.
   * @throws {BeacoError} When the event is unavailable or the request cannot be completed.
   */
  async retrieve(id: string, options: RequestOptions = {}): Promise<EventDetail> {
    const value = await this.http.request<ApiEventDetail>(`/events/${id}`, options);
    return {
      ...mapEvent(value),
      templateId: value.template_id,
      payload: value.payload,
      metadata: value.metadata,
      batchId: value.batch_id,
      notifications: value.notifications.map(mapNotification),
    };
  }
}
