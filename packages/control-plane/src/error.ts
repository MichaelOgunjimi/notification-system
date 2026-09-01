type ValidationIssue = { message?: string; msg?: string };
type ErrorPayload = {
  detail?: string | ValidationIssue[];
  error?: { message?: string; details?: ValidationIssue[] };
};

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

export class ControlPlaneError extends Error {
  readonly code: ControlPlaneErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "ControlPlaneError";
    this.status = status;
    this.code = codeForStatus(status);
    this.retryable = status === 429 || status >= 500;
  }
}

export async function controlPlaneErrorFromResponse(
  response: Response,
  fallback: string,
): Promise<ControlPlaneError> {
  const payload = (await response.json().catch(() => ({}))) as ErrorPayload;
  const issues = Array.isArray(payload.detail)
    ? payload.detail
    : payload.error?.details;
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

export function controlPlaneNetworkError(cause: unknown): ControlPlaneError {
  return new ControlPlaneError("The workspace service is unavailable.", 503, {
    cause,
  });
}
