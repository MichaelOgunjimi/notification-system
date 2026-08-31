type ValidationIssue = { message?: string; msg?: string };
type ErrorPayload = {
  detail?: string | ValidationIssue[];
  error?: { message?: string; details?: ValidationIssue[] };
};

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

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "AuthError";
    this.status = status;
    this.code = codeForStatus(status);
    this.retryable = status === 429 || status >= 500;
  }
}

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

export function authNetworkError(cause: unknown): AuthError {
  return new AuthError("The sign-in service is unavailable.", 503, { cause });
}
