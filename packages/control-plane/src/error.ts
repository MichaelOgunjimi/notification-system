type ValidationIssue = { message?: string; msg?: string };
type ErrorPayload = {
  detail?: string | ValidationIssue[];
  error?: { message?: string; details?: ValidationIssue[] };
};

/** Stable error categories exposed to control-plane package consumers. */
export type ControlPlaneErrorCode =
  | "invalid_request"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "service_unavailable"
  | "unexpected_error";

function codeForStatus(status: number): ControlPlaneErrorCode {
  if (status === 400 || status === 422) return "invalid_request";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "service_unavailable";
  return "unexpected_error";
}

/**
 * Structured failure returned by the control-plane client.
 *
 * The error preserves an HTTP status, a stable application code, and whether a
 * retry is reasonable so UI and query layers do not parse backend messages.
 */
export class ControlPlaneError extends Error {
  /** Stable category derived from the response status. */
  readonly code: ControlPlaneErrorCode;
  /** HTTP status returned by the application boundary, or 503 for network failures. */
  readonly status: number;
  /** Whether retrying may succeed without changing the request. */
  readonly retryable: boolean;

  /**
   * Creates a structured control-plane failure.
   *
   * @param message Human-readable failure reason suitable for application UI.
   * @param status HTTP status associated with the failure.
   * @param options Optional native error options, including an underlying cause.
   */
  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "ControlPlaneError";
    this.status = status;
    this.code = codeForStatus(status);
    this.retryable = status === 429 || status >= 500;
  }
}

/**
 * Converts a failed HTTP response into a normalized control-plane error.
 *
 * @param response Failed response returned by the application boundary.
 * @param fallback Message used when the response has no readable error payload.
 * @returns Structured error retaining the response status and retry semantics.
 */
export async function controlPlaneErrorFromResponse(
  response: Response,
  fallback: string,
): Promise<ControlPlaneError> {
  const payload = (await response.json().catch(() => ({}))) as ErrorPayload;
  const issues = Array.isArray(payload.detail) ? payload.detail : payload.error?.details;
  const detail = issues
    ? issues
        .map((issue) => issue.message ?? issue.msg)
        .filter(Boolean)
        .join(" ")
    : typeof payload.detail === "string"
      ? payload.detail
      : payload.error?.message;
  return new ControlPlaneError(detail || fallback, response.status);
}

/**
 * Wraps a transport exception as a retryable service-unavailable error.
 *
 * @param cause Original exception raised by the configured fetch transport.
 * @returns Structured 503 error with the original exception as its cause.
 */
export function controlPlaneNetworkError(cause: unknown): ControlPlaneError {
  return new ControlPlaneError("The workspace service is unavailable.", 503, {
    cause,
  });
}
