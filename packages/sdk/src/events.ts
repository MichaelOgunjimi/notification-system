import { type ApiPage, HttpClient, mapPage, query } from "./http";
import { mapNotification, type ApiNotification } from "./notifications";
import { PublishEventInputSchema } from "./schemas";
import type {
  Event,
  EventDetail,
  EventListOptions,
  EventPriority,
  EventStatus,
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

/** @internal Converts one SDK event input to the REST representation. */
export function mapEventInput(value: PublishEventInput) {
  return {
    event_type: value.eventType,
    recipients: value.recipients.map(mapRecipient),
    priority: value.priority,
    template_id: value.templateId,
    template_name: value.templateName,
    payload: value.payload,
    metadata: value.metadata,
    idempotency_key: value.idempotencyKey,
  };
}

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
  constructor(private readonly http: HttpClient) {}

  /**
   * Publishes one event for immediate notification fan-out.
   * @param input Event, recipients, template, and delivery controls.
   * @param options Optional cancellation signal.
   * @returns The accepted event summary.
   * @throws A `BeacoError` when the request fails.
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
   * Publishes multiple events atomically.
   * @param events Events to publish in one batch.
   * @param options Optional cancellation signal.
   * @returns Accepted event summaries in input order.
   * @throws A `BeacoError` when validation or the request fails.
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
   * @param options Filters, pagination, and optional cancellation signal.
   * @returns One page of event summaries.
   * @throws A `BeacoError` when the request fails.
   */
  async list(options: EventListOptions = {}): Promise<Page<Event>> {
    const page = await this.http.request<ApiPage<ApiEvent>>(`/events${query(options)}`, {
      signal: options.signal,
    });
    return mapPage(page, mapEvent);
  }

  /**
   * Retrieves one event and its generated notifications.
   * @param id Event identifier.
   * @param options Optional cancellation signal.
   * @returns Detailed event state.
   * @throws A `BeacoError` when the event is unavailable or the request fails.
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
