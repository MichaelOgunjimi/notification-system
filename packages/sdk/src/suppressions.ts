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
  constructor(private readonly http: HttpClient) {}

  /**
   * Creates a suppression for one channel address.
   * @param input Channel, recipient, and suppression reason.
   * @param options Optional cancellation signal.
   * @returns The created suppression.
   * @throws A `BeacoError` when validation or the request fails.
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
   * @param options Filters, pagination, and optional cancellation signal.
   * @returns One page of suppressions.
   * @throws A `BeacoError` when the request fails.
   */
  async list(options: SuppressionListOptions = {}): Promise<Page<Suppression>> {
    const page = await this.http.request<ApiPage<ApiSuppression>>(
      `/suppressions${query(options)}`,
      { signal: options.signal },
    );
    return mapPage(page, mapSuppression);
  }

  /**
   * Permanently removes a suppression.
   * @param id Suppression identifier.
   * @param options Optional cancellation signal.
   * @returns Nothing after successful deletion.
   * @throws A `BeacoError` when the suppression is unavailable or the request fails.
   */
  async delete(id: string, options: RequestOptions = {}): Promise<void> {
    await this.http.request<void>(`/suppressions/${id}`, {
      method: "DELETE",
      signal: options.signal,
    });
  }
}
