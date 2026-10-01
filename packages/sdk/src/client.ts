import { EventsResource } from "./events";
import { HttpClient } from "./http";
import { NotificationsResource } from "./notifications";
import { ScheduledEventsResource } from "./scheduled-events";
import { SuppressionsResource } from "./suppressions";
import { TemplatesResource } from "./templates";
import type { BeacoOptions } from "./types";

/** Server-side client for the Beaco notification API. */
export class Beaco {
  /** Event publication and lookup operations. */
  readonly events: EventsResource;
  /** Template creation, preview, and management operations. */
  readonly templates: TemplatesResource;
  /** Notification delivery lookup operations. */
  readonly notifications: NotificationsResource;
  /** Deferred event operations. */
  readonly scheduledEvents: ScheduledEventsResource;
  /** Recipient suppression operations. */
  readonly suppressions: SuppressionsResource;

  /**
   * Creates a reusable, server-side Beaco client.
   *
   * Construction performs no network I/O. Every resource shares the configured transport,
   * timeout, and secret project API key.
   *
   * @param options - Authentication, endpoint, transport, and timeout configuration. Keep
   * `options.apiKey` in a server-side secret store; it is sent in the `X-API-Key` header.
   * @throws {TypeError} When the API key is empty or the timeout is not positive.
   * @throws {TypeError} When the base URL is invalid or uses unsafe cleartext HTTP.
   * @throws {Error} When constructed in a browser, where the project key would be exposed.
   */
  constructor(options: BeacoOptions) {
    const http = new HttpClient(options);
    this.events = new EventsResource(http);
    this.templates = new TemplatesResource(http);
    this.notifications = new NotificationsResource(http);
    this.scheduledEvents = new ScheduledEventsResource(http);
    this.suppressions = new SuppressionsResource(http);
  }
}
