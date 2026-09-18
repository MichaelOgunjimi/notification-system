/** Membership role that determines a user's organization-level capabilities. */
export type OrganizationRole = "owner" | "admin" | "member" | "viewer";

/** Backend-derived operation that the current user may perform in an organization. */
export type OrganizationCapability =
  | "organization:read"
  | "organization:manage"
  | "organization:members:manage"
  | "project:create"
  | "project:manage"
  | "api_key:manage"
  | "project:templates:read"
  | "project:templates:manage"
  | "project:deliveries:read"
  | "project:deliveries:manage"
  | "project:usage:read"
  | "project:audit:read"
  | "organization:templates:read"
  | "organization:usage:read"
  | "organization:audit:read"
  | "organization:billing:manage"
  | "organization:delete";

/**
 * Organization visible to the authenticated user.
 *
 * @property id Stable backend identifier used by control-plane endpoints.
 * @property name Human-readable organization name.
 * @property slug URL-safe organization identifier.
 * @property description Optional organization summary.
 * @property role Current user's membership role in the organization.
 * @property capabilities Backend-derived operations available to the current user.
 */
export type Organization = Readonly<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: OrganizationRole;
  capabilities: readonly OrganizationCapability[];
  /** When the organization was archived, or null while active. */
  archivedAt: string | null;
}>;

/** Editable fields accepted by the organization settings endpoint. */
export type OrganizationUpdate = Readonly<{
  name?: string;
  slug?: string;
  description?: string | null;
}>;

/**
 * Fields required to create an organization. The first project is created in
 * the same request, so its name and slug are supplied by the caller.
 */
export type OrganizationCreate = Readonly<{
  name: string;
  slug: string;
  description?: string | null;
  project: Readonly<{ name: string; slug: string }>;
}>;

/**
 * Project belonging to an organization available to the authenticated user.
 *
 * @property id Stable backend project identifier.
 * @property organizationId Identifier of the owning organization.
 * @property name Human-readable project name.
 * @property slug URL-safe identifier unique within the organization.
 * @property description Optional project summary.
 */
export type Project = Readonly<{
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  /** When the project was archived, or null while active. */
  archivedAt: string | null;
}>;

/** Fields accepted when creating a project inside an organization. */
export type ProjectCreate = Readonly<{
  name: string;
  slug: string;
  description?: string | null;
}>;

/** Editable fields accepted by the project settings endpoint. */
export type ProjectUpdate = Readonly<{
  name?: string;
  slug?: string;
  description?: string | null;
}>;

/** Organization member visible to users allowed to inspect membership. */
export type OrganizationMember = Readonly<{
  id: string;
  userId: string;
  email: string;
  name: string;
  role: OrganizationRole;
  joinedAt: string;
}>;

/** Pending invitation issued for an organization. */
export type OrganizationInvitation = Readonly<{
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  invitedByUserId: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}>;

/** Fields required to invite a member to an organization. */
export type OrganizationInvitationCreate = Readonly<{
  email: string;
  role: OrganizationRole;
}>;

/** Unauthenticated description of a pending invitation, resolved from its token. */
export type OrganizationInvitationPreview = Readonly<{
  organizationName: string;
  email: string;
  role: OrganizationRole;
  inviterName: string;
  expiresAt: string;
}>;

/** One page of a paginated collection returned by a control-plane endpoint. */
export type Paginated<T> = Readonly<{
  items: readonly T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}>;

/** Environment a project API key authenticates against. */
export type ProjectApiKeyEnvironment = "test" | "live";

/** Permission a project API key may be granted against the notification API. */
export type ApiKeyScope =
  | "events:read"
  | "events:write"
  | "templates:read"
  | "templates:write"
  | "notifications:read"
  | "scheduled_events:read"
  | "scheduled_events:write"
  | "suppressions:read"
  | "suppressions:write"
  | "analytics:read"
  | "dead_letters:read"
  | "dead_letters:write"
  | "usage:read"
  | "audit:read"
  | "settings:read";

/**
 * Project API key metadata. The plaintext key is never included here; it is
 * returned once by {@link ControlPlaneClient.apiKeys.create} and `rotate`.
 */
export type ProjectApiKey = Readonly<{
  id: string;
  projectId: string;
  keyPrefix: string;
  name: string;
  description: string | null;
  environment: ProjectApiKeyEnvironment;
  scopes: readonly ApiKeyScope[];
  isActive: boolean;
  rateLimitPerMin: number | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  /** The key this one replaced when it was created by rotation, else null. */
  rotatedFromId: string | null;
}>;

/** Whether an API key list is scoped to active or revoked keys. */
export type ProjectApiKeyStatus = "active" | "revoked";

/** Optional filters and pagination for {@link ControlPlaneClient.apiKeys.list}. */
export type ProjectApiKeyListOptions = Readonly<{
  page?: number;
  perPage?: number;
  environment?: ProjectApiKeyEnvironment;
  status?: ProjectApiKeyStatus;
}>;

/** Project API key including the one-time plaintext secret. */
export type CreatedProjectApiKey = ProjectApiKey & Readonly<{ key: string }>;

/** Fields accepted when creating a project API key. */
export type ProjectApiKeyCreate = Readonly<{
  name: string;
  description?: string | null;
  scopes: readonly ApiKeyScope[];
  rateLimitPerMin?: number | null;
  environment?: ProjectApiKeyEnvironment;
}>;

/** Editable fields accepted by the project API key update endpoint. */
export type ProjectApiKeyUpdate = Readonly<{
  name?: string;
  description?: string | null;
  scopes?: readonly ApiKeyScope[];
  rateLimitPerMin?: number | null;
}>;

/** One recorded action in the tenant activity log. */
export type AuditLogEntry = Readonly<{
  id: string;
  organizationId: string;
  projectId: string | null;
  actorUserId: string | null;
  /** Display name of the acting user, when the actor was a person. */
  actorName: string | null;
  /** Current organization role of the acting user (owner / admin / …), when known. */
  actorRole: string | null;
  apiKeyId: string | null;
  /** Name of the acting API key, when the actor was a key. */
  apiKeyName: string | null;
  /** Environment (live / test) of the acting API key, when the actor was a key. */
  apiKeyEnvironment: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}>;

/**
 * Filters and pagination for {@link ControlPlaneClient.auditLog} queries.
 *
 * `actor` accepts `"user"` or `"api_key"` to match any entry from that kind of
 * actor, or a specific user/API-key id.
 */
export type AuditLogFilter = Readonly<{
  page?: number;
  perPage?: number;
  action?: string;
  actor?: string;
  /** Restrict to one activity surface's action namespaces. */
  category?: "governance" | "operational";
  /** ISO timestamp; only entries at or after this moment are returned. */
  from?: string;
  /** ISO timestamp; only entries at or before this moment are returned. */
  to?: string;
}>;

/** One hour-bucketed request count for a single API key and endpoint. */
export type UsageEntry = Readonly<{
  projectId: string;
  apiKeyId: string;
  /** Name of the key that made these requests. */
  apiKeyName: string;
  /** Environment (live / test) of the key that made these requests. */
  apiKeyEnvironment: string;
  endpoint: string;
  /** ISO timestamp for the start of the hour this row aggregates. */
  hourBucket: string;
  requestCount: number;
}>;

/** Request totals for one API key environment (live / test). */
export type UsageEnvironmentSummary = Readonly<{
  environment: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
}>;

/** Aggregate request volume and outcome over a tenant scope and time window. */
export type UsageSummary = Readonly<{
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  projectCount: number;
  apiKeyCount: number;
  byEnvironment: readonly UsageEnvironmentSummary[];
}>;

/** Pagination, key, and date range for {@link ControlPlaneClient.usage} list queries. */
export type UsageFilter = Readonly<{
  page?: number;
  perPage?: number;
  /** Narrow to one API key; omit for every key in scope. */
  apiKeyId?: string;
  /** ISO timestamp; only buckets at or after this moment are returned. */
  from?: string;
  /** ISO timestamp; only buckets at or before this moment are returned. */
  to?: string;
}>;

/** Key and date range for {@link ControlPlaneClient.usage} summary queries. */
export type UsageSummaryFilter = Readonly<{
  apiKeyId?: string;
  from?: string;
  to?: string;
}>;

/** Request volume for one hour of the day (0-23, UTC), summed across every
 * matching day in the queried range. */
export type UsageHourlyPoint = Readonly<{
  hour: number;
  requestCount: number;
}>;

/** An endpoint's request count, as one row of a top-endpoints ranking. */
export type UsageEndpointStat = Readonly<{
  endpoint: string;
  requestCount: number;
}>;

/** Notification outcome counts for one delivery channel. */
export type ChannelStat = Readonly<{
  channel: string;
  delivered: number;
  failed: number;
  pending: number;
  deadLetter: number;
}>;

/** Delivery metrics and channel mix over a date range (defaults to today). */
export type AnalyticsSummary = Readonly<{
  eventsToday: number;
  eventsCompleted: number;
  eventsFailed: number;
  eventsProcessing: number;
  notificationsDelivered: number;
  notificationsFailed: number;
  notificationsProcessing: number;
  notificationsQueued: number;
  dlqActive: number;
  /** Percentage of terminal notifications that delivered successfully. */
  successRate: number;
  /** Average time from queued to delivered, in milliseconds; null with no data. */
  avgDeliveryLatencyMs: number | null;
  p50DeliveryLatencyMs: number | null;
  p95DeliveryLatencyMs: number | null;
  p99DeliveryLatencyMs: number | null;
  channelStats: readonly ChannelStat[];
}>;

/** Notification status counts for one time bucket. */
export type TrendPoint = Readonly<{
  /** ISO timestamp for the start of this bucket. */
  timestamp: string;
  delivered: number;
  failed: number;
  queued: number;
  processing: number;
}>;

/** A delivery-status time series over the queried range. */
export type Trends = Readonly<{
  points: readonly TrendPoint[];
}>;

/** Key and date range for {@link ControlPlaneClient.usage} analytics queries. */
export type AnalyticsFilter = Readonly<{
  apiKeyId?: string;
  from?: string;
  to?: string;
}>;

/** {@link AnalyticsFilter} plus the trend bucket size. */
export type TrendsFilter = AnalyticsFilter &
  Readonly<{
    /** Bucket size: `"hour"` or `"day"` (default). */
    granularity?: "hour" | "day";
  }>;

/** Lifecycle status of an ingested event. */
export type EventStatus =
  "accepted" | "processing" | "completed" | "partially_failed" | "failed" | "cancelled";

/** Delivery urgency assigned to an event and its notifications. */
export type EventPriority = "high" | "medium" | "low";

/** One ingested notification request, as shown in the tenant event log. */
export type TenantEvent = Readonly<{
  id: string;
  eventType: string;
  priority: EventPriority;
  status: EventStatus;
  recipientCount: number;
  apiKeyId: string;
  apiKeyName: string;
  apiKeyEnvironment: string;
  /** Whether any notification spawned from this event failed or dead-lettered. */
  hasFailures: boolean;
  createdAt: string;
}>;

/** One notification spawned from an event, in the detail fan-out list. */
export type TenantEventNotification = Readonly<{
  id: string;
  channel: string;
  status: string;
  recipientAddress: string;
  errorMessage: string | null;
  createdAt: string;
  deliveredAt: string | null;
}>;

/** A single event with its raw payload and fan-out notifications. */
export type TenantEventDetail = Readonly<{
  id: string;
  eventType: string;
  priority: EventPriority;
  status: EventStatus;
  recipientCount: number;
  apiKeyId: string;
  apiKeyName: string;
  apiKeyEnvironment: string;
  idempotencyKey: string | null;
  batchId: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  notifications: readonly TenantEventNotification[];
}>;

/** Filters and pagination for {@link ControlPlaneClient.events} list queries. */
export type EventFilter = Readonly<{
  page?: number;
  perPage?: number;
  status?: EventStatus;
  priority?: EventPriority;
  /** Case-insensitive substring match on the event type. */
  eventType?: string;
  from?: string;
  to?: string;
}>;

/** Lifecycle state of one channel-specific delivery instance. */
export type NotificationStatus =
  "pending" | "queued" | "processing" | "delivered" | "failed" | "dead_letter" | "cancelled";

/** Channel used to deliver a rendered notification. */
export type NotificationChannel = "email" | "sms" | "webhook";

/** One notification in the project delivery stream. */
export type TenantNotification = Readonly<{
  id: string;
  eventId: string;
  eventType: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  priority: EventPriority;
  recipientAddress: string;
  retryCount: number;
  maxRetries: number;
  errorMessage: string | null;
  createdAt: string;
  deliveredAt: string | null;
  failedAt: string | null;
}>;

/** One immutable state transition in a notification's delivery history. */
export type TenantNotificationLog = Readonly<{
  id: string;
  previousStatus: string | null;
  newStatus: string;
  workerId: string | null;
  errorType: string | null;
  errorMessage: string | null;
  providerResponse: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}>;

/** Full notification payload and delivery history. */
export type TenantNotificationDetail = TenantNotification &
  Readonly<{
    recipientUserId: string;
    renderedSubject: string | null;
    renderedBody: string | null;
    nextRetryAt: string | null;
    providerResponse: Record<string, unknown> | null;
    queuedAt: string | null;
    processingStartedAt: string | null;
    updatedAt: string;
    deadLetterStatus: "active" | "retried" | "discarded" | null;
    logs: readonly TenantNotificationLog[];
  }>;

/** Filters and pagination for a project's notification delivery stream. */
export type NotificationFilter = Readonly<{
  page?: number;
  perPage?: number;
  /** A single state, or several to match any of (e.g. the Alerts surface's failed + dead_letter). */
  status?: NotificationStatus | readonly NotificationStatus[];
  channel?: NotificationChannel;
  /** Matches recipient, event type, notification id, or event id. */
  search?: string;
  from?: string;
  to?: string;
}>;

/** Delivery channel a template renders for. */
export type TemplateChannel = "email" | "sms" | "webhook";

/** Metric an alert rule watches — each reuses a field Usage already computes. */
export type AlertMetric = "failure_rate" | "dead_letter_count" | "avg_latency_ms";

/** A project's own delivery-health monitoring rule. */
export type AlertRule = Readonly<{
  id: string;
  projectId: string;
  name: string;
  metric: AlertMetric;
  threshold: number;
  windowMinutes: number;
  notifyEmail: string | null;
  isActive: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
}>;

/** Pagination for listing a project's alert rules. */
export type AlertRuleListOptions = Readonly<{
  page?: number;
  perPage?: number;
}>;

/** Fields accepted when creating an alert rule. */
export type AlertRuleCreate = Readonly<{
  name: string;
  metric: AlertMetric;
  threshold: number;
  windowMinutes?: number;
  notifyEmail?: string | null;
  isActive?: boolean;
}>;

/** Fields accepted when updating an alert rule; omitted fields remain unchanged. */
export type AlertRuleUpdate = Readonly<{
  name?: string;
  metric?: AlertMetric;
  threshold?: number;
  windowMinutes?: number;
  notifyEmail?: string | null;
  isActive?: boolean;
}>;

/**
 * A project's own template, or a system default when `projectId` is null.
 * Every key in a project shares one template pool — ownership is at the
 * project level, not the individual key.
 */
export type Template = Readonly<{
  id: string;
  projectId: string | null;
  apiKeyId: string | null;
  name: string;
  channel: TemplateChannel;
  subject: string | null;
  body: string;
  variables: readonly string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}>;

/** Optional pagination and channel filter for listing templates. */
export type TemplateListOptions = Readonly<{
  page?: number;
  perPage?: number;
  channel?: TemplateChannel;
}>;

/** {@link TemplateListOptions} plus an optional project to narrow an organization-wide list. */
export type OrganizationTemplateListOptions = TemplateListOptions &
  Readonly<{ projectId?: string }>;

/** Fields accepted when creating a template. */
export type TemplateCreate = Readonly<{
  name: string;
  channel: TemplateChannel;
  subject?: string | null;
  body: string;
  variables?: readonly string[];
}>;

/** Fields accepted when updating a template; omitted fields remain unchanged. */
export type TemplateUpdate = Readonly<{
  name?: string;
  channel?: TemplateChannel;
  subject?: string | null;
  body?: string;
  variables?: readonly string[];
}>;

/**
 * Configuration for a browser-facing control-plane client.
 *
 * @property appControlPlanePath Same-origin application boundary that holds session cookies.
 * @property fetch Optional transport override for tests or non-browser hosts.
 */
export type ControlPlaneClientOptions = Readonly<{
  appControlPlanePath?: string;
  fetch?: typeof globalThis.fetch;
}>;

/** Browser-safe interface for authenticated organization and project operations. */
export interface ControlPlaneClient {
  /** Organization operations available to the current user. */
  readonly organizations: {
    /**
     * Lists organizations the authenticated user can access.
     *
     * @param includeArchived When true, includes archived organizations too.
     * @returns Application-facing organization records.
     * @throws {ControlPlaneError} When the application boundary or backend rejects the request.
     */
    list(includeArchived?: boolean): Promise<Organization[]>;
    /**
     * Creates an organization owned by the current user. The backend also seeds
     * a default project so the workspace is immediately usable.
     *
     * @param organization Name, URL slug, and optional description.
     * @returns The created organization including the caller's owner capabilities.
     * @throws {ControlPlaneError} When the slug conflicts or validation fails.
     */
    create(organization: OrganizationCreate): Promise<Organization>;
    /**
     * Updates organization-owned profile fields.
     *
     * @param organizationId Stable organization identifier.
     * @param changes Fields to update; omitted fields remain unchanged.
     * @returns Updated organization including the caller's effective capabilities.
     * @throws {ControlPlaneError} When validation, authorization, or transport fails.
     */
    update(organizationId: string, changes: OrganizationUpdate): Promise<Organization>;
    /**
     * Archives an organization and removes it from active listings.
     *
     * @param organizationId Stable organization identifier.
     * @returns Archived organization record.
     * @throws {ControlPlaneError} When the owner requirement or request fails.
     */
    archive(organizationId: string): Promise<Organization>;
    /**
     * Un-archives an organization. Any projects archived alongside it (or on
     * their own) stay archived — restore each one individually.
     *
     * @param organizationId Stable organization identifier.
     * @returns Restored organization record.
     * @throws {ControlPlaneError} When the owner requirement or request fails.
     */
    restore(organizationId: string): Promise<Organization>;
  };
  /** Membership operations scoped by organization authorization. */
  readonly members: {
    /**
     * Lists active organization memberships.
     *
     * @param organizationId Stable organization identifier.
     * @returns Member records visible to the authenticated caller.
     * @throws {ControlPlaneError} When membership cannot be verified.
     */
    list(organizationId: string): Promise<OrganizationMember[]>;
    /**
     * Changes the role assigned to an existing membership.
     *
     * @param organizationId Stable organization identifier.
     * @param membershipId Stable membership identifier.
     * @param role New organization role.
     * @returns Updated member record.
     * @throws {ControlPlaneError} When capability or owner invariants reject the change.
     */
    updateRole(
      organizationId: string,
      membershipId: string,
      role: OrganizationRole,
    ): Promise<OrganizationMember>;
    /**
     * Removes an existing membership.
     *
     * @param organizationId Stable organization identifier.
     * @param membershipId Stable membership identifier.
     * @returns Promise resolved after removal succeeds.
     * @throws {ControlPlaneError} When capability or final-owner rules reject removal.
     */
    remove(organizationId: string, membershipId: string): Promise<void>;
  };
  /** Pending organization invitation operations. */
  readonly invitations: {
    /**
     * Lists invitations for an organization.
     *
     * @param organizationId Stable organization identifier.
     * @returns Invitation history; consumers can filter accepted and revoked entries.
     * @throws {ControlPlaneError} When member-management access is unavailable.
     */
    list(organizationId: string): Promise<OrganizationInvitation[]>;
    /**
     * Invites an email address to join an organization.
     *
     * @param organizationId Stable organization identifier.
     * @param invitation Verified email and non-owner role to invite.
     * @returns Created or renewed invitation record.
     * @throws {ControlPlaneError} When validation, delivery, or authorization fails.
     */
    create(
      organizationId: string,
      invitation: OrganizationInvitationCreate,
    ): Promise<OrganizationInvitation>;
    /**
     * Revokes a pending organization invitation.
     *
     * @param organizationId Stable organization identifier.
     * @param invitationId Stable invitation identifier.
     * @returns Promise resolved after revocation succeeds.
     * @throws {ControlPlaneError} When the invitation cannot be managed.
     */
    revoke(organizationId: string, invitationId: string): Promise<void>;
    /**
     * Accepts an organization invitation on behalf of the signed-in user.
     *
     * @param token One-time invitation token from the emailed accept link.
     * @returns Promise resolved once the membership exists.
     * @throws {ControlPlaneError} When the token is invalid, expired, or was
     * issued to an email the current user has not verified.
     */
    accept(token: string): Promise<void>;
    /**
     * Describes a pending invitation from its token, without a session.
     *
     * @param token One-time invitation token from the emailed accept link.
     * @returns The target organization name, granted role, and inviter name.
     * @throws {ControlPlaneError} When the token is unknown, revoked, accepted,
     * or expired (404).
     */
    preview(token: string): Promise<OrganizationInvitationPreview>;
  };
  /** Project operations scoped by organization membership. */
  readonly projects: {
    /**
     * Lists projects visible within an organization.
     *
     * @param organizationId Stable identifier of the organization to inspect.
     * @param includeArchived When true, includes archived projects too.
     * @returns Application-facing project records belonging to the organization.
     * @throws {ControlPlaneError} When access is denied or the service is unavailable.
     */
    list(organizationId: string, includeArchived?: boolean): Promise<Project[]>;
    /**
     * Creates a project inside an organization.
     *
     * @param organizationId Stable organization identifier.
     * @param project Project profile fields.
     * @returns Newly created project.
     * @throws {ControlPlaneError} When capability, validation, or transport fails.
     */
    create(organizationId: string, project: ProjectCreate): Promise<Project>;
    /**
     * Updates a project's name, slug, or description.
     *
     * @param projectId Stable project identifier.
     * @param changes Fields to update; omitted fields remain unchanged.
     * @returns Updated project record.
     * @throws {ControlPlaneError} When the slug conflicts or `project:manage` is unavailable.
     */
    update(projectId: string, changes: ProjectUpdate): Promise<Project>;
    /**
     * Archives a project and removes it from active listings.
     *
     * @param projectId Stable project identifier.
     * @returns Archived project record.
     * @throws {ControlPlaneError} When project-management access is unavailable.
     */
    archive(projectId: string): Promise<Project>;
    /**
     * Un-archives a project.
     *
     * @param projectId Stable project identifier.
     * @returns Restored project record.
     * @throws {ControlPlaneError} When project-management access is unavailable.
     */
    restore(projectId: string): Promise<Project>;
  };
  /** Project API key operations; every request requires the `api_key:manage` capability. */
  readonly apiKeys: {
    /**
     * Lists a project's API keys, newest and active first.
     *
     * @param projectId Stable project identifier.
     * @param options Optional 1-based page and page size (1-100, default 20).
     * @returns One page of API key metadata without plaintext secrets.
     * @throws {ControlPlaneError} When API key management access is unavailable.
     */
    list(projectId: string, options?: ProjectApiKeyListOptions): Promise<Paginated<ProjectApiKey>>;
    /**
     * Creates a project API key.
     *
     * @param projectId Stable project identifier.
     * @param input Name, scopes (at least one), and optional description, rate limit, environment.
     * @returns The new key including its one-time plaintext secret.
     * @throws {ControlPlaneError} When validation or authorization fails.
     */
    create(projectId: string, input: ProjectApiKeyCreate): Promise<CreatedProjectApiKey>;
    /**
     * Updates a project API key's name, description, scopes, or rate limit.
     *
     * @param projectId Stable project identifier.
     * @param apiKeyId Stable API key identifier.
     * @param changes Fields to update; omitted fields remain unchanged.
     * @returns Updated API key metadata.
     * @throws {ControlPlaneError} When the key is revoked or access is denied.
     */
    update(
      projectId: string,
      apiKeyId: string,
      changes: ProjectApiKeyUpdate,
    ): Promise<ProjectApiKey>;
    /**
     * Revokes a project API key. The record is retained for audit history.
     *
     * @param projectId Stable project identifier.
     * @param apiKeyId Stable API key identifier.
     * @returns Promise resolved after revocation succeeds.
     * @throws {ControlPlaneError} When the key cannot be managed.
     */
    revoke(projectId: string, apiKeyId: string): Promise<void>;
    /**
     * Rotates a project API key: revokes the current key and issues a
     * replacement carrying the same configuration.
     *
     * @param projectId Stable project identifier.
     * @param apiKeyId Stable identifier of the key to rotate.
     * @returns The replacement key including its one-time plaintext secret.
     * @throws {ControlPlaneError} When the key is already revoked or access is denied.
     */
    rotate(projectId: string, apiKeyId: string): Promise<CreatedProjectApiKey>;
  };
  /** Read-only tenant activity log. */
  readonly auditLog: {
    /**
     * Lists a project's recorded actions, newest first.
     *
     * @param projectId Stable project identifier.
     * @param filter Optional page, page size (1-100, default 20), and action/actor/from filters.
     * @returns One page of audit entries with resolved actor names.
     * @throws {ControlPlaneError} When the `project:audit:read` capability is unavailable.
     */
    forProject(projectId: string, filter?: AuditLogFilter): Promise<Paginated<AuditLogEntry>>;
    /**
     * Lists actions across an organization and all its projects, newest first.
     *
     * @param organizationId Stable organization identifier.
     * @param filter Optional page, page size (1-100, default 20), and action/actor/from filters.
     * @returns One page of audit entries with resolved actor names.
     * @throws {ControlPlaneError} When the `organization:audit:read` capability is unavailable.
     */
    forOrganization(
      organizationId: string,
      filter?: AuditLogFilter,
    ): Promise<Paginated<AuditLogEntry>>;
  };
  /** Read-only tenant API usage — request volume per key, endpoint, and hour. */
  readonly usage: {
    /**
     * Lists a project's hourly usage buckets, newest first.
     *
     * @param projectId Stable project identifier.
     * @param filter Optional page, page size (1-200, default 50), and date range.
     * @returns One page of usage rows with resolved API key names.
     * @throws {ControlPlaneError} When the `project:templates:read` capability is unavailable.
     */
    forProject(projectId: string, filter?: UsageFilter): Promise<Paginated<UsageEntry>>;
    /**
     * Lists usage buckets across an organization and all its projects, newest first.
     *
     * @param organizationId Stable organization identifier.
     * @param filter Optional page, page size (1-200, default 50), and date range.
     * @returns One page of usage rows with resolved API key names.
     * @throws {ControlPlaneError} When the `organization:usage:read` capability is unavailable.
     */
    forOrganization(organizationId: string, filter?: UsageFilter): Promise<Paginated<UsageEntry>>;
    /**
     * Aggregates a project's request volume and outcome over a date range.
     *
     * @param projectId Stable project identifier.
     * @param filter Optional date range; unbounded when omitted.
     * @returns Totals and a breakdown by API key environment.
     * @throws {ControlPlaneError} When the `project:templates:read` capability is unavailable.
     */
    summaryForProject(projectId: string, filter?: UsageSummaryFilter): Promise<UsageSummary>;
    /**
     * Aggregates an organization's request volume and outcome over a date range.
     *
     * @param organizationId Stable organization identifier.
     * @param filter Optional date range; unbounded when omitted.
     * @returns Totals and a breakdown by API key environment.
     * @throws {ControlPlaneError} When the `organization:templates:read` capability is unavailable.
     */
    summaryForOrganization(
      organizationId: string,
      filter?: UsageSummaryFilter,
    ): Promise<UsageSummary>;
    /**
     * Buckets a project's usage by hour of day (0-23, UTC) over a date range.
     *
     * @param projectId Stable project identifier.
     * @param filter Optional key filter and date range; unbounded when omitted.
     * @returns All 24 hours, zero-filled where there was no traffic.
     * @throws {ControlPlaneError} When the `project:usage:read` capability is unavailable.
     */
    hourlyForProject(projectId: string, filter?: UsageFilter): Promise<readonly UsageHourlyPoint[]>;
    /**
     * Buckets an organization's usage by hour of day (0-23, UTC) over a date range.
     *
     * @param organizationId Stable organization identifier.
     * @param filter Optional key filter and date range; unbounded when omitted.
     * @returns All 24 hours, zero-filled where there was no traffic.
     * @throws {ControlPlaneError} When the `organization:templates:read` capability is unavailable.
     */
    hourlyForOrganization(
      organizationId: string,
      filter?: UsageFilter,
    ): Promise<readonly UsageHourlyPoint[]>;
    /**
     * Ranks a project's endpoints by request count over a date range.
     *
     * @param projectId Stable project identifier.
     * @param filter Optional key filter, date range, and result limit (default 8, max 20).
     * @returns Endpoints sorted by request count, descending.
     * @throws {ControlPlaneError} When the `project:usage:read` capability is unavailable.
     */
    topEndpointsForProject(
      projectId: string,
      filter?: UsageFilter & Readonly<{ limit?: number }>,
    ): Promise<readonly UsageEndpointStat[]>;
    /**
     * Ranks an organization's endpoints by request count over a date range.
     *
     * @param organizationId Stable organization identifier.
     * @param filter Optional key filter, date range, and result limit (default 8, max 20).
     * @returns Endpoints sorted by request count, descending.
     * @throws {ControlPlaneError} When the `organization:usage:read` capability is unavailable.
     */
    topEndpointsForOrganization(
      organizationId: string,
      filter?: UsageFilter & Readonly<{ limit?: number }>,
    ): Promise<readonly UsageEndpointStat[]>;
    /**
     * Delivery metrics and channel mix for a project over a date range.
     *
     * @param projectId Stable project identifier.
     * @param filter Optional key filter and date range (defaults to today).
     * @returns Event/notification counts, success rate, latency, and channel stats.
     * @throws {ControlPlaneError} When the `project:usage:read` capability is unavailable.
     */
    analyticsForProject(projectId: string, filter?: AnalyticsFilter): Promise<AnalyticsSummary>;
    /**
     * Delivery metrics and channel mix for an organization over a date range.
     *
     * @param organizationId Stable organization identifier.
     * @param filter Optional key filter and date range (defaults to today).
     * @returns Event/notification counts, success rate, latency, and channel stats.
     * @throws {ControlPlaneError} When the `organization:usage:read` capability is unavailable.
     */
    analyticsForOrganization(
      organizationId: string,
      filter?: AnalyticsFilter,
    ): Promise<AnalyticsSummary>;
    /**
     * Delivery-status time series for a project over a date range.
     *
     * @param projectId Stable project identifier.
     * @param filter Optional key filter, date range, and bucket granularity (defaults to today, by day).
     * @returns Delivered/failed/queued/processing counts per bucket.
     * @throws {ControlPlaneError} When the `project:usage:read` capability is unavailable.
     */
    trendsForProject(projectId: string, filter?: TrendsFilter): Promise<Trends>;
    /**
     * Delivery-status time series for an organization over a date range.
     *
     * @param organizationId Stable organization identifier.
     * @param filter Optional key filter, date range, and bucket granularity (defaults to today, by day).
     * @returns Delivered/failed/queued/processing counts per bucket.
     * @throws {ControlPlaneError} When the `organization:usage:read` capability is unavailable.
     */
    trendsForOrganization(organizationId: string, filter?: TrendsFilter): Promise<Trends>;
  };
  /** A project's shared template library — every key in the project uses the same pool. */
  readonly templates: {
    /**
     * Fetches one template usable by this project: its own, or a system default.
     *
     * @param projectId Stable project identifier.
     * @param templateId Stable template identifier.
     * @returns The template.
     * @throws {ControlPlaneError} When the template isn't visible to this project, or access is denied.
     */
    get(projectId: string, templateId: string): Promise<Template>;
    /**
     * Lists templates strictly owned by this project — never a system default.
     *
     * @param projectId Stable project identifier.
     * @param options Optional page, page size (1-100, default 20), and channel filter.
     * @returns One page of this project's own templates.
     * @throws {ControlPlaneError} When the `project:usage:read` capability is unavailable.
     */
    forProject(projectId: string, options?: TemplateListOptions): Promise<Paginated<Template>>;
    /**
     * Lists the shared system default templates available to every project.
     *
     * @param projectId Stable project identifier (used only to authorize the request).
     * @param options Optional page, page size (1-100, default 20), and channel filter.
     * @returns One page of system default templates.
     * @throws {ControlPlaneError} When the `project:usage:read` capability is unavailable.
     */
    defaultsForProject(
      projectId: string,
      options?: TemplateListOptions,
    ): Promise<Paginated<Template>>;
    /**
     * Lists templates across every project in an organization.
     *
     * @param organizationId Stable organization identifier.
     * @param options Optional page, page size, channel filter, and a project id to narrow without switching scope.
     * @returns One page of templates spanning the organization's projects.
     * @throws {ControlPlaneError} When the `organization:usage:read` capability is unavailable.
     */
    forOrganization(
      organizationId: string,
      options?: OrganizationTemplateListOptions,
    ): Promise<Paginated<Template>>;
    /**
     * Lists the shared system default templates (organization-scoped view).
     *
     * @param organizationId Stable organization identifier (used only to authorize the request).
     * @param options Optional page, page size (1-100, default 20), and channel filter.
     * @returns One page of system default templates.
     * @throws {ControlPlaneError} When the `organization:usage:read` capability is unavailable.
     */
    defaultsForOrganization(
      organizationId: string,
      options?: TemplateListOptions,
    ): Promise<Paginated<Template>>;
    /**
     * Creates a template owned by this project.
     *
     * @param projectId Stable project identifier.
     * @param input Name, channel, body, and optional subject/variables.
     * @returns The new template.
     * @throws {ControlPlaneError} When a template with the same name and channel already exists in this project, or `project:templates:manage` is unavailable.
     */
    create(projectId: string, input: TemplateCreate): Promise<Template>;
    /**
     * Updates a template owned by this project.
     *
     * @param projectId Stable project identifier.
     * @param templateId Stable template identifier.
     * @param changes Fields to update; omitted fields remain unchanged.
     * @returns The updated template.
     * @throws {ControlPlaneError} When the template isn't owned by this project, or access is denied.
     */
    update(projectId: string, templateId: string, changes: TemplateUpdate): Promise<Template>;
    /**
     * Soft-deletes a template owned by this project.
     *
     * @param projectId Stable project identifier.
     * @param templateId Stable template identifier.
     * @returns Promise resolved after the delete succeeds.
     * @throws {ControlPlaneError} When the template isn't owned by this project, or access is denied.
     */
    delete(projectId: string, templateId: string): Promise<void>;
    /**
     * Copies a system default into a new template owned by this project. The
     * original default is never modified.
     *
     * @param projectId Stable project identifier.
     * @param templateId Stable identifier of the system default to fork.
     * @returns The new, independently-editable copy.
     * @throws {ControlPlaneError} When the source isn't a system default, or access is denied.
     */
    fork(projectId: string, templateId: string): Promise<Template>;
  };
  /** A project's own delivery-health monitoring rules. */
  readonly alertRules: {
    /**
     * Lists alert rules owned by this project.
     *
     * @param projectId Stable project identifier.
     * @param options Optional page and page size (1-100, default 20).
     * @returns One page of this project's alert rules.
     * @throws {ControlPlaneError} When the `project:deliveries:read` capability is unavailable.
     */
    forProject(projectId: string, options?: AlertRuleListOptions): Promise<Paginated<AlertRule>>;
    /**
     * Creates an alert rule owned by this project.
     *
     * @param projectId Stable project identifier.
     * @param input Name, metric, threshold, and optional window/notify/active fields.
     * @returns The new alert rule.
     * @throws {ControlPlaneError} When the `project:deliveries:manage` capability is unavailable.
     */
    create(projectId: string, input: AlertRuleCreate): Promise<AlertRule>;
    /**
     * Updates an alert rule owned by this project.
     *
     * @param projectId Stable project identifier.
     * @param ruleId Stable alert rule identifier.
     * @param changes Fields to update; omitted fields remain unchanged.
     * @returns The updated alert rule.
     * @throws {ControlPlaneError} When the rule isn't owned by this project, or access is denied.
     */
    update(projectId: string, ruleId: string, changes: AlertRuleUpdate): Promise<AlertRule>;
    /**
     * Deletes an alert rule owned by this project.
     *
     * @param projectId Stable project identifier.
     * @param ruleId Stable alert rule identifier.
     * @returns Promise resolved after the delete succeeds.
     * @throws {ControlPlaneError} When the rule isn't owned by this project, or access is denied.
     */
    delete(projectId: string, ruleId: string): Promise<void>;
  };
  /** Read-only tenant event log — every ingested notification request, by project. */
  readonly events: {
    /**
     * Lists a project's events, newest first.
     *
     * @param projectId Stable project identifier.
     * @param filter Optional page, page size (1-100, default 25), status,
     *   priority, event-type search, and date range.
     * @returns One page of events with resolved API key names and a failure flag.
     * @throws {ControlPlaneError} When the `project:usage:read` capability is unavailable.
     */
    forProject(projectId: string, filter?: EventFilter): Promise<Paginated<TenantEvent>>;
    /**
     * Lists events across an organization and all its projects, newest first.
     *
     * @param organizationId Stable organization identifier.
     * @param filter Optional page, page size, status, priority, event-type search, and date range.
     * @returns One page of events with resolved API key names and a failure flag.
     * @throws {ControlPlaneError} When the `organization:usage:read` capability is unavailable.
     */
    forOrganization(organizationId: string, filter?: EventFilter): Promise<Paginated<TenantEvent>>;
    /**
     * Fetches one event with its raw payload and every notification it spawned.
     *
     * @param projectId Stable project identifier the event must belong to.
     * @param eventId Stable event identifier.
     * @returns The event detail including the fan-out notification list.
     * @throws {ControlPlaneError} When the event isn't visible to this project, or access is denied.
     */
    get(projectId: string, eventId: string): Promise<TenantEventDetail>;
  };
  /** Read-only, project-scoped notification delivery records. */
  readonly notifications: {
    /**
     * Lists notifications for one project, newest first.
     *
     * @param projectId Stable project identifier.
     * @param filter Optional page, status, channel, search, and date filters.
     * @returns A paginated delivery stream.
     * @throws {ControlPlaneError} When project delivery access is unavailable.
     */
    forProject(
      projectId: string,
      filter?: NotificationFilter,
    ): Promise<Paginated<TenantNotification>>;
    /**
     * Fetches one notification with its rendered content and attempt history.
     *
     * @param projectId Project that must own the notification.
     * @param notificationId Stable notification identifier.
     * @returns Full delivery detail.
     * @throws {ControlPlaneError} When the notification is not visible to the project.
     */
    get(projectId: string, notificationId: string): Promise<TenantNotificationDetail>;
    /** Requeues a notification whose dead letter is still active. */
    retry(projectId: string, notificationId: string): Promise<TenantNotificationDetail>;
    /** Acknowledges an active dead letter without retrying it. */
    discard(projectId: string, notificationId: string): Promise<TenantNotificationDetail>;
  };
}

/** Raw organization payload returned by the FastAPI control-plane endpoint. */
export type ApiOrganization = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: OrganizationRole;
  capabilities: OrganizationCapability[];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

/** Raw project payload returned by the FastAPI control-plane endpoint. */
export type ApiProject = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

/** Raw organization membership payload returned by FastAPI. */
export type ApiOrganizationMember = {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: OrganizationRole;
  joined_at: string;
};

/** Raw organization invitation payload returned by FastAPI. */
export type ApiOrganizationInvitation = {
  id: string;
  organization_id: string;
  email: string;
  role: OrganizationRole;
  invited_by_user_id: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

/** Raw invitation preview payload returned by FastAPI. */
export type ApiOrganizationInvitationPreview = {
  organization_name: string;
  email: string;
  role: OrganizationRole;
  inviter_name: string;
  expires_at: string;
};

/** Raw paginated collection envelope returned by FastAPI. */
export type ApiPaginated<T> = {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
};

/** Raw audit log entry returned by FastAPI. */
export type ApiAuditLogEntry = {
  id: string;
  organization_id: string;
  project_id: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  api_key_id: string | null;
  api_key_name: string | null;
  api_key_environment: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
};

/** Raw usage row returned by FastAPI. */
export type ApiUsageEntry = {
  project_id: string;
  api_key_id: string;
  api_key_name: string;
  api_key_environment: string;
  endpoint: string;
  hour_bucket: string;
  request_count: number;
};

/** Raw per-environment usage summary returned by FastAPI. */
export type ApiUsageEnvironmentSummary = {
  environment: string;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
};

/** Raw usage summary returned by FastAPI. */
export type ApiUsageSummary = {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  project_count: number;
  api_key_count: number;
  by_environment: ApiUsageEnvironmentSummary[];
};

/** Raw hourly usage bucket returned by FastAPI. */
export type ApiUsageHourlyPoint = {
  hour: number;
  request_count: number;
};

/** Raw endpoint usage ranking row returned by FastAPI. */
export type ApiUsageEndpointStat = {
  endpoint: string;
  request_count: number;
};

/** Raw channel stat returned by FastAPI. */
export type ApiChannelStat = {
  channel: string;
  delivered: number;
  failed: number;
  pending: number;
  dead_letter: number;
};

/** Raw analytics summary returned by FastAPI. */
export type ApiAnalyticsSummary = {
  events_today: number;
  events_completed: number;
  events_failed: number;
  events_processing: number;
  notifications_delivered: number;
  notifications_failed: number;
  notifications_processing: number;
  notifications_queued: number;
  dlq_active: number;
  success_rate: number;
  avg_delivery_latency_ms: number | null;
  p50_delivery_latency_ms: number | null;
  p95_delivery_latency_ms: number | null;
  p99_delivery_latency_ms: number | null;
  channel_stats: ApiChannelStat[];
};

/** Raw trend point returned by FastAPI. */
export type ApiTrendPoint = {
  timestamp: string;
  delivered: number;
  failed: number;
  queued: number;
  processing: number;
};

/** Raw trend series returned by FastAPI. */
export type ApiTrends = {
  points: ApiTrendPoint[];
};

/** Raw template payload returned by FastAPI. */
export type ApiTemplate = {
  id: string;
  project_id: string | null;
  api_key_id: string | null;
  name: string;
  channel: TemplateChannel;
  subject: string | null;
  body: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Raw alert rule payload returned by FastAPI. */
export type ApiAlertRule = {
  id: string;
  project_id: string;
  name: string;
  metric: AlertMetric;
  threshold: number;
  window_minutes: number;
  notify_email: string | null;
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
};

/** Raw tenant event payload returned by FastAPI. */
export type ApiTenantEvent = {
  id: string;
  event_type: string;
  priority: EventPriority;
  status: EventStatus;
  recipient_count: number;
  api_key_id: string;
  api_key_name: string;
  api_key_environment: string;
  has_failures: boolean;
  created_at: string;
};

/** Raw fan-out notification payload in an event detail response. */
export type ApiTenantEventNotification = {
  id: string;
  channel: string;
  status: string;
  recipient_address: string;
  error_message: string | null;
  created_at: string;
  delivered_at: string | null;
};

/** Raw tenant event detail payload returned by FastAPI. */
export type ApiTenantEventDetail = {
  id: string;
  event_type: string;
  priority: EventPriority;
  status: EventStatus;
  recipient_count: number;
  api_key_id: string;
  api_key_name: string;
  api_key_environment: string;
  idempotency_key: string | null;
  batch_id: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  notifications: ApiTenantEventNotification[];
};

/** Raw tenant notification payload returned by FastAPI. */
export type ApiTenantNotification = {
  id: string;
  event_id: string;
  event_type: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  priority: EventPriority;
  recipient_address: string;
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  created_at: string;
  delivered_at: string | null;
  failed_at: string | null;
};

/** Raw notification state transition returned by FastAPI. */
export type ApiTenantNotificationLog = {
  id: string;
  previous_status: string | null;
  new_status: string;
  worker_id: string | null;
  error_type: string | null;
  error_message: string | null;
  provider_response: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

/** Raw notification detail returned by FastAPI. */
export type ApiTenantNotificationDetail = ApiTenantNotification & {
  recipient_user_id: string;
  rendered_subject: string | null;
  rendered_body: string | null;
  next_retry_at: string | null;
  provider_response: Record<string, unknown> | null;
  queued_at: string | null;
  processing_started_at: string | null;
  updated_at: string;
  dead_letter_status: "active" | "retried" | "discarded" | null;
  logs: ApiTenantNotificationLog[];
};

/** Raw project API key payload returned by FastAPI. */
export type ApiProjectApiKey = {
  id: string;
  project_id: string;
  key_prefix: string;
  name: string;
  description: string | null;
  environment: ProjectApiKeyEnvironment;
  scopes: ApiKeyScope[];
  is_active: boolean;
  rate_limit_per_min: number | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  rotated_from_id: string | null;
};

/** Raw project API key payload including the one-time plaintext secret. */
export type ApiCreatedProjectApiKey = ApiProjectApiKey & { key: string };
