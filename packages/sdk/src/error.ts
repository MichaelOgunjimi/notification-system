/** One invalid request field returned by the Beaco API. */
export interface BeacoValidationIssue {
  field: string;
  message: string;
}

/** Structured error thrown for failed Beaco API and network requests. */
export class BeacoError extends Error {
  /** Stable API error code, or `NETWORK_ERROR` when no response was received. */
  readonly code: string;
  /** HTTP status, or `0` when no response was received. */
  readonly status: number;
  /** Field-level validation failures returned by the API. */
  readonly details: BeacoValidationIssue[];
  /** Whether the same request may succeed when retried later. */
  readonly retryable: boolean;

  /**
   * Creates a structured SDK error.
   *
   * @param message Human-readable failure description.
   * @param options Stable code, status, validation details, and optional underlying cause.
   */
  constructor(
    message: string,
    options: {
      code: string;
      status: number;
      details?: BeacoValidationIssue[];
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "BeacoError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details ?? [];
    this.retryable = options.status === 0 || options.status === 429 || options.status >= 500;
  }
}
