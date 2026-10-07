/** Delivery channels supported by Beaco. */
export type NotificationChannel = "email" | "sms" | "webhook";

/** Event delivery priority. */
export type EventPriority = "high" | "medium" | "low";

/** Aggregate event lifecycle status. */
export type EventStatus =
  "accepted" | "processing" | "completed" | "partially_failed" | "failed" | "cancelled";

/** Individual notification delivery status. */
export type NotificationStatus =
  "pending" | "queued" | "processing" | "delivered" | "failed" | "dead_letter" | "cancelled";

/** Deferred-event lifecycle status. */
export type ScheduledEventStatus =
  "pending" | "processing" | "dispatched" | "cancelled" | "failed" | "expired";

/** Why a recipient was suppressed. */
export type SuppressionReason = "manual" | "hard_bounce" | "spam_complaint";

/** Where a suppression originated. */
export type SuppressionSource = "client" | "system";

/** A recipient and the channels through which Beaco should notify them. */
export interface Recipient {
  userId?: string;
  channels: NotificationChannel[];
  email?: string;
  phone?: string;
  webhookUrl?: string;
}

/** Already-rendered email content sent without Jinja processing. */
export interface InlineEmail {
  subject?: string;
  html: string;
  text?: string;
  /** Part before the @ of the sender, e.g. `orders`. The domain is always the server's. */
  fromLocal?: string;
  /** Sender display name, e.g. `Winwell Orders`. Plain text only. */
  fromName?: string;
  /** Address replies go to. Any valid email address; needs no DNS. */
  replyTo?: string;
}

/**
 * An email attachment Beaco never stores: `url` is downloaded each time the email is sent.
 * Email delivery only. The URL must be publicly reachable; private and internal addresses
 * are refused.
 */
export interface Attachment {
  /** File name shown to the recipient. No slashes or control characters. */
  filename: string;
  /** Public http(s) URL of the file. Must stay reachable until delivery succeeds, including retries. */
  url: string;
  /** Declared file size in bytes, used to reject oversized emails early. Not verified. */
  sizeBytes: number;
}

/** Input for publishing an event immediately. */
export interface PublishEventInput {
  eventType: string;
  recipients: Recipient[];
  priority?: EventPriority;
  templateId?: string;
  templateName?: string;
  inline?: InlineEmail;
  /** Up to 10 files attached to email notifications; their declared sizes total at most 30 MB. */
  attachments?: Attachment[];
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

/** Summary returned when an event is accepted. */
export interface Event {
  id: string;
  eventType: string;
  priority: EventPriority;
  status: EventStatus;
  recipientCount: number;
  hasFailures: boolean;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Detailed event including its generated notifications. */
export interface EventDetail extends Event {
  templateId: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  batchId: string | null;
  notifications: Notification[];
}

/** Filters accepted when listing events. */
export interface EventListOptions extends PageOptions {
  status?: EventStatus;
  priority?: EventPriority;
  eventType?: string;
  dateFrom?: string;
  dateTo?: string;
  signal?: AbortSignal;
}

/** Input used to create a reusable delivery template. */
export interface CreateTemplateInput {
  name: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  textBody?: string;
  /** Part before the @ of the sender. The domain is always the server's. */
  fromLocal?: string;
  /** Sender display name. Plain text only. */
  fromName?: string;
  /** Address replies go to. Any valid email address. */
  replyTo?: string;
  variables?: string[];
  onMissingVariable?: "error" | "blank";
}

/** Editable template fields. */
export interface UpdateTemplateInput {
  name?: string;
  channel?: NotificationChannel;
  subject?: string | null;
  body?: string;
  textBody?: string | null;
  /** Part before the @ of the sender. Pass `null` to clear it. */
  fromLocal?: string | null;
  /** Sender display name. Pass `null` to clear it. */
  fromName?: string | null;
  /** Address replies go to. Pass `null` to clear it. */
  replyTo?: string | null;
  variables?: string[];
  onMissingVariable?: "error" | "blank";
}

/** Template content synchronized by name and channel. */
export interface UpsertTemplateInput {
  subject?: string;
  body: string;
  textBody?: string;
  /** Part before the @ of the sender. The domain is always the server's. */
  fromLocal?: string;
  /** Sender display name. Plain text only. */
  fromName?: string;
  /** Address replies go to. Any valid email address. */
  replyTo?: string;
  variables?: string[];
  onMissingVariable?: "error" | "blank";
}

/** Existing HTML plus sample values used to mark variable text. */
export interface ImportTemplateInput {
  name: string;
  subject?: string;
  html: string;
  variables?: Record<string, string>;
}

/** A reusable channel-specific delivery template. */
export interface Template {
  id: string;
  projectId: string | null;
  apiKeyId: string | null;
  name: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  textBody: string | null;
  fromLocal: string | null;
  fromName: string | null;
  replyTo: string | null;
  variables: string[];
  detectedVariables: string[];
  onMissingVariable: "error" | "blank";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Filters accepted when listing templates. */
export interface TemplateListOptions extends PageOptions {
  channel?: NotificationChannel;
  signal?: AbortSignal;
}

/** Rendered template content returned by a preview. */
export interface TemplatePreview {
  subject: string | null;
  html: string;
  text: string;
  body: string;
  variablesUsed: string[];
  missingVariables: string[];
}

/** Template and sample-data preview returned by HTML import. */
export interface ImportTemplateResult {
  template: Template;
  preview: TemplatePreview;
}

/** Summary of one generated notification. */
export interface Notification {
  id: string;
  eventId: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  recipientAddress: string;
  retryCount: number;
  maxRetries: number;
  renderedSubject: string | null;
  errorMessage: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One status transition recorded for a notification. */
export interface NotificationLog {
  id: string;
  status: string;
  message: string | null;
  attemptNumber: number;
  createdAt: string;
}

/** Detailed delivery information for one notification. */
export interface NotificationDetail extends Notification {
  priority: string;
  recipientUserId: string | null;
  renderedBody: string | null;
  notificationLogs: NotificationLog[];
}

/** Filters accepted when listing notifications. */
export interface NotificationListOptions extends PageOptions {
  status?: NotificationStatus;
  channel?: NotificationChannel;
  dateFrom?: string;
  dateTo?: string;
  recipient?: string;
  signal?: AbortSignal;
}

/** Input for scheduling an event for future delivery. */
export interface CreateScheduledEventInput extends Omit<PublishEventInput, "idempotencyKey"> {
  /** Future delivery time. Events more than an hour overdue are expired rather than sent. */
  scheduledFor: string | Date;
}

/** A deferred event and its current status. */
export interface ScheduledEvent {
  id: string;
  apiKeyId: string;
  eventType: string;
  scheduledFor: string;
  priority: EventPriority;
  status: ScheduledEventStatus;
  eventId: string | null;
  /** Why the event is `failed` or `expired`; `null` otherwise. */
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Filters accepted when listing scheduled events. */
export interface ScheduledEventListOptions extends PageOptions {
  status?: ScheduledEventStatus;
  signal?: AbortSignal;
}

/** Input for preventing delivery to one channel address. */
export interface CreateSuppressionInput {
  channel: NotificationChannel;
  recipient: string;
  reason?: SuppressionReason;
  source?: SuppressionSource;
}

/** A blocked channel recipient. */
export interface Suppression {
  id: string;
  apiKeyId: string;
  channel: NotificationChannel;
  recipient: string;
  reason: SuppressionReason;
  source: SuppressionSource;
  createdAt: string;
}

/** Filters accepted when listing suppressions. */
export interface SuppressionListOptions extends PageOptions {
  channel?: NotificationChannel;
  signal?: AbortSignal;
}

/** Pagination fields shared by list operations. */
export interface PageOptions {
  page?: number;
  perPage?: number;
}

/** A page returned by a Beaco list operation. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/** Options accepted by operations that do not otherwise take input. */
export interface RequestOptions {
  signal?: AbortSignal;
}

/** Configuration for a {@link Beaco} client. */
export interface BeacoOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  /** Opt in to a non-loopback HTTP baseUrl. The API key is sent in cleartext when enabled. */
  allowInsecureHttp?: boolean;
}
