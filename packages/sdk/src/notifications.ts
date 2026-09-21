import { type ApiPage, HttpClient, mapPage, query } from "./http";
import type {
  Notification,
  NotificationDetail,
  NotificationListOptions,
  NotificationLog,
  NotificationStatus,
  NotificationChannel,
  Page,
  RequestOptions,
} from "./types";

/** @internal REST representation of a notification. */
export type ApiNotification = {
  id: string;
  event_id: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  recipient_address: string;
  retry_count: number;
  max_retries: number;
  rendered_subject: string | null;
  error_message: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string;
};

type ApiNotificationLog = {
  id: string;
  status: string;
  message: string | null;
  attempt_number: number;
  created_at: string;
};

type ApiNotificationDetail = ApiNotification & {
  priority: string;
  recipient_user_id: string | null;
  rendered_body: string | null;
  notification_logs: ApiNotificationLog[];
};

/** @internal Converts a REST notification to the public SDK representation. */
export function mapNotification(value: ApiNotification): Notification {
  return {
    id: value.id,
    eventId: value.event_id,
    channel: value.channel,
    status: value.status,
    recipientAddress: value.recipient_address,
    retryCount: value.retry_count,
    maxRetries: value.max_retries,
    renderedSubject: value.rendered_subject,
    errorMessage: value.error_message,
    deliveredAt: value.delivered_at,
    failedAt: value.failed_at,
    nextRetryAt: value.next_retry_at,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function mapLog(value: ApiNotificationLog): NotificationLog {
  return {
    id: value.id,
    status: value.status,
    message: value.message,
    attemptNumber: value.attempt_number,
    createdAt: value.created_at,
  };
}

/** Read-only access to notification delivery records. */
export class NotificationsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Lists notifications visible to the configured project API key.
   * @param options Filters, pagination, and optional cancellation signal.
   * @returns One page of notification summaries.
   * @throws A `BeacoError` when the request fails.
   */
  async list(options: NotificationListOptions = {}): Promise<Page<Notification>> {
    const page = await this.http.request<ApiPage<ApiNotification>>(
      `/notifications${query(options)}`,
      { signal: options.signal },
    );
    return mapPage(page, mapNotification);
  }

  /**
   * Retrieves one notification and its delivery history.
   * @param id Notification identifier.
   * @param options Optional cancellation signal.
   * @returns Detailed notification state and delivery logs.
   * @throws A `BeacoError` when the notification is unavailable or the request fails.
   */
  async retrieve(id: string, options: RequestOptions = {}): Promise<NotificationDetail> {
    const value = await this.http.request<ApiNotificationDetail>(`/notifications/${id}`, options);
    return {
      ...mapNotification(value),
      priority: value.priority,
      recipientUserId: value.recipient_user_id,
      renderedBody: value.rendered_body,
      notificationLogs: value.notification_logs.map(mapLog),
    };
  }
}
