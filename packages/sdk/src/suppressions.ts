import { type ApiPage, HttpClient, mapPage, query } from "./http";
import { CreateSuppressionInputSchema } from "./schemas";
import type {
  CreateSuppressionInput,
  NotificationChannel,
  Page,
  RequestOptions,
  Suppression,
  SuppressionListOptions,
  SuppressionReason,
  SuppressionSource,
} from "./types";

type ApiSuppression = {
  id: string;
  api_key_id: string;
  channel: NotificationChannel;
  recipient: string;
  reason: SuppressionReason;
  source: SuppressionSource;
  created_at: string;
};

/** @internal Converts a REST suppression to the public camelCase model. */
function mapSuppression(value: ApiSuppression): Suppression {
  return {
    id: value.id,
    apiKeyId: value.api_key_id,
    channel: value.channel,
    recipient: value.recipient,
    reason: value.reason,
    source: value.source,
    createdAt: value.created_at,
  };
}

/** Manages recipients blocked from receiving notifications. */
export class SuppressionsResource {
  /** @internal Creates suppression operations over a shared authenticated transport. */
  constructor(private readonly http: HttpClient) {}

  /**
   * Creates a suppression for one channel address.
   * Future matching notifications are blocked until this suppression is deleted.
   *
   * @param input - Channel, recipient address, reason, and source.
   * @param options - Optional cancellation signal. Aborting it cancels the HTTP request.
   * @returns The created suppression.
   * @throws {ZodError} When `input` fails local schema validation.
   * @throws {BeacoError} When validation, authorization, or the API request fails.
   */
  async create(input: CreateSuppressionInput, options: RequestOptions = {}): Promise<Suppression> {
    input = CreateSuppressionInputSchema.parse(input);
    return mapSuppression(
      await this.http.request<ApiSuppression>("/suppressions", {
        method: "POST",
        body: input,
        signal: options.signal,
      }),
    );
  }

  /**
   * Lists suppressions owned by the configured API key.
   * @param options - Channel filter, pagination, and an optional cancellation signal.
   * @returns One page of suppressions and pagination metadata.
   * @throws {BeacoError} When the API rejects the request or cannot be reached.
   */
  async list(options: SuppressionListOptions = {}): Promise<Page<Suppression>> {
    const page = await this.http.request<ApiPage<ApiSuppression>>(
      `/suppressions${query(options)}`,
      { signal: options.signal },
    );
    return mapPage(page, mapSuppression);
  }

  /**
   * Permanently removes a suppression, allowing future matching deliveries.
   *
   * @param id - Unique suppression identifier.
   * @param options - Optional cancellation signal. Aborting it cancels the HTTP request.
   * @returns Nothing after successful deletion.
   * @throws {BeacoError} When the suppression is unavailable or the request cannot be completed.
   */
  async delete(id: string, options: RequestOptions = {}): Promise<void> {
    await this.http.request<void>(`/suppressions/${id}`, {
      method: "DELETE",
      signal: options.signal,
    });
  }
}
