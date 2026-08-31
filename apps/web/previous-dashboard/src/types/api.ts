export type NotificationChannel = "email" | "sms" | "webhook";
export type EventPriority = "high" | "medium" | "low";
export type EventStatus =
  | "accepted"
  | "processing"
  | "completed"
  | "partially_failed"
  | "failed"
  | "cancelled";
export type NotificationStatus =
  | "pending"
  | "queued"
  | "processing"
  | "delivered"
  | "failed"
  | "dead_letter"
  | "cancelled";
export type DeadLetterStatus = "active" | "retried" | "discarded";
export type ScheduledEventStatus = "PENDING" | "DISPATCHED" | "CANCELLED" | "EXPIRED";

export type Channel = NotificationChannel;
export type Priority = EventPriority;
export type DLQStatus = DeadLetterStatus;

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface EventResponse {
  id: string;
  event_type: string;
  priority: EventPriority;
  status: EventStatus;
  recipient_count: number;
  has_failures: boolean;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventDetailResponse {
  id: string;
  event_type: string;
  priority: EventPriority;
  status: EventStatus;
  template_id: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  idempotency_key: string | null;
  batch_id: string | null;
  recipient_count: number;
  has_failures: boolean;
  notifications: NotificationResponse[];
  created_at: string;
  updated_at: string;
}

export interface NotificationResponse {
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
}

export interface NotificationDetailResponse {
  id: string;
  event_id: string;
  channel: NotificationChannel;
  recipient_address: string;
  status: NotificationStatus;
  priority: string;
  recipient_user_id: string | null;
  rendered_subject: string | null;
  rendered_body: string | null;
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
  failed_at: string | null;
  notification_logs: NotificationLogResponse[];
}

export interface NotificationLogResponse {
  id: string;
  status: string;
  message: string | null;
  attempt_number: number;
  created_at: string;
}

export interface DeadLetterResponse {
  id: string;
  notification_id: string;
  channel: NotificationChannel;
  recipient_address: string;
  error_type: string;
  error_message: string;
  retry_count: number;
  status: DeadLetterStatus;
  failed_at: string;
  created_at: string;
}

export interface DeadLetterDetailResponse {
  id: string;
  notification_id: string;
  channel: NotificationChannel;
  recipient_address: string;
  event_payload: Record<string, unknown>;
  error_type: string;
  error_message: string;
  retry_count: number;
  retry_history: Record<string, unknown>[];
  status: DeadLetterStatus;
  failed_at: string;
  retried_at: string | null;
  discarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsResponse {
  events_today: number;
  events_completed: number;
  events_failed: number;
  events_processing: number;
  notifications_delivered: number;
  notifications_failed: number;
  notifications_processing: number;
  notifications_queued: number;
  dlq_active: number;
  avg_delivery_latency_ms: number | null;
  success_rate: number;
  channel_stats: ChannelStat[];
}

export interface ChannelStat {
  channel: NotificationChannel;
  delivered: number;
  failed: number;
  pending: number;
  dead_letter: number;
}

export interface TrendPoint {
  timestamp: string;
  delivered: number;
  failed: number;
  queued: number;
  processing: number;
}

export interface TrendResponse {
  points: TrendPoint[];
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  key_prefix: string;
  rate_limit_per_min: number | null;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export interface ApiKeyCreateResponse {
  id: string;
  key: string;
  key_prefix: string;
  name: string;
  is_active: boolean;
  rate_limit_per_min: number | null;
  created_at: string;
  last_used_at: string | null;
}

export interface TemplateResponse {
  id: string;
  api_key_id: string | null;
  name: string;
  slug: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SuppressionResponse {
  id: string;
  api_key_id: string;
  channel: NotificationChannel;
  recipient: string;
  reason: string | null;
  source: string | null;
  created_at: string;
}

export interface AlertRuleResponse {
  id: string;
  name: string;
  metric: string;
  threshold: number;
  window_minutes: number;
  notify_email: string | null;
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
}

export interface AuditLogResponse {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface UsageResponse {
  api_key_id: string;
  endpoint: string;
  hour_bucket: string;
  request_count: number;
}

export interface AdminHealthResponse {
  worker_count: number;
  queue_depths: Record<string, number>;
  error_rate_1h: number;
  redis_connected: boolean;
  db_connected: boolean;
}

export interface AdminKeyStats {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  rate_limit_per_min: number | null;
  notification_count: number;
  last_used_at: string | null;
  created_at: string;
}
