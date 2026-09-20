import { BeacoError, type BeacoValidationIssue } from "./error";
import type { BeacoOptions, Page } from "./types";

const DEFAULT_BASE_URL = "https://beaco.michaelogunjimi.com/api/v1";
const DEFAULT_TIMEOUT_MS = 10_000;

type ApiErrorPayload = {
  error?: { code?: string; message?: string; details?: BeacoValidationIssue[] };
  detail?: string;
};

/** @internal REST representation of a paginated response. */
export type ApiPage<T> = {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
};

/** @internal Converts a REST page to the public SDK representation. */
export function mapPage<TApi, T>(page: ApiPage<TApi>, map: (item: TApi) => T): Page<T> {
  return {
    items: page.items.map(map),
    total: page.total,
    page: page.page,
    perPage: page.per_page,
    totalPages: page.total_pages,
  };
}

/** @internal Encodes camelCase list filters as REST query parameters. */
export function query(options: object = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && key !== "signal") params.set(toSnakeCase(key), String(value));
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** @internal Shared authenticated HTTP transport. */
export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: BeacoOptions) {
    if (!options.apiKey?.trim()) throw new TypeError("Beaco apiKey is required.");
    if (options.timeoutMs !== undefined && options.timeoutMs <= 0) {
      throw new TypeError("Beaco timeoutMs must be greater than zero.");
    }
    if (typeof window !== "undefined") {
      throw new Error("@beaco/sdk is server-only. Do not expose a Beaco API key in browser code.");
    }
    this.apiKey = options.apiKey.trim();
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async request<T>(
    path: string,
    init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
  ): Promise<T> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: init.method ?? "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal,
      });
    } catch (cause) {
      throw new BeacoError("Unable to reach the Beaco API.", {
        code: "NETWORK_ERROR",
        status: 0,
        cause,
      });
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
      throw new BeacoError(
        payload.error?.message ??
          payload.detail ??
          `Beaco API request failed (${response.status}).`,
        {
          code: payload.error?.code ?? "API_ERROR",
          status: response.status,
          details: payload.error?.details,
        },
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
