type ValidationIssue = { message?: string; msg?: string };
type ErrorPayload = {
  detail?: string | ValidationIssue[];
  error?: { message?: string; details?: ValidationIssue[] };
};

/**
 * Standardized error categories exposed by the auth package.
 */
export type AuthErrorCode =
  | "invalid_request"
  | "unauthenticated"
  | "forbidden"
  | "rate_limited"
  | "service_unavailable"
  | "unexpected_error";

function codeForStatus(status: number): AuthErrorCode {
  if (status === 400 || status === 422) return "invalid_request";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "service_unavailable";
  return "unexpected_error";
}

/**
 * Error raised when an auth request fails with a backend or network problem.
 */
export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  /**
   * @param message Human-readable reason for the failure.
   * @param status HTTP status code returned by the backend.
   * @param options Optional ErrorOptions passed to the base Error implementation.
   */
  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "AuthError";
    this.status = status;
    this.code = codeForStatus(status);
    this.retryable = status === 429 || status >= 500;
  }
}

/**
 * Converts an HTTP error response into a structured auth error.
 *
 * @param response Response object from the auth endpoint.
 * @param fallback Friendly fallback message when the backend does not provide one.
 * @returns AuthError with a normalized code and status.
 */
export async function authErrorFromResponse(
  response: Response,
  fallback: string,
): Promise<AuthError> {
  const payload = (await response.json().catch(() => ({}))) as ErrorPayload;
  const issues = Array.isArray(payload.detail) ? payload.detail : payload.error?.details;
  const detail = issues
    ? issues.map((issue) => issue.message ?? issue.msg).filter(Boolean).join(" ")
    : typeof payload.detail === "string"
      ? payload.detail
      : payload.error?.message;
  return new AuthError(detail || fallback, response.status);
}

/**
 * Wraps a transport failure as a standard auth service error.
 *
 * @param cause Underlying network or fetch error.
 * @returns AuthError describing an unavailable sign-in service.
 */
export function authNetworkError(cause: unknown): AuthError {
  return new AuthError("The sign-in service is unavailable.", 503, { cause });
}
