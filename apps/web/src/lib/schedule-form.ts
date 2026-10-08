import type {
  ApiKeyScope,
  ControlPlaneIssue,
  EventPriority,
  NotificationChannel,
  ProjectApiKey,
  ScheduledEventCreate,
} from "@beaco/control-plane";

/** The scope a key needs to own a scheduled event; the API enforces the same rule. */
export const SCHEDULE_SCOPE: ApiKeyScope = "scheduled_events:write";

/** One recipient row in the form. `id` is a stable React key, not sent to the API. */
export type RecipientDraft = Readonly<{
  id: string;
  userId: string;
  channels: readonly NotificationChannel[];
  email: string;
  phone: string;
  webhookUrl: string;
}>;

/** Everything the schedule form edits, as the raw strings the user typed or picked. */
export type ScheduleFormState = Readonly<{
  apiKeyId: string;
  eventType: string;
  priority: EventPriority;
  source: "template" | "inline";
  templateName: string;
  subject: string;
  html: string;
  text: string;
  recipients: readonly RecipientDraft[];
  /** JSON object text for the event payload / template variables. */
  payload: string;
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  /** Local wall-clock time, `HH:mm`. */
  time: string;
}>;

/** Form field keys that can carry an inline message. Recipient fields are `recipients.<n>.<field>`. */
export type FieldErrors = Readonly<Record<string, string>>;

const pad = (value: number) => String(Math.abs(value)).padStart(2, "0");

/**
 * Builds an ISO 8601 timestamp for a local date and time that carries the local UTC offset.
 *
 * The API stores UTC and compares against UTC, so a bare local time would silently shift by the
 * user's offset. Returns null for an unparseable or non-existent local time.
 *
 * @param date Local calendar date, `YYYY-MM-DD`.
 * @param time Local wall-clock time, `HH:mm`.
 * @returns For example `2026-10-20T09:00:00+01:00`, or null.
 */
export function toOffsetIso(date: string, time: string): string | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!day || !clock) return null;
  const [year, month, dom] = [Number(day[1]), Number(day[2]), Number(day[3])];
  const [hours, minutes] = [Number(clock[1]), Number(clock[2])];
  const local = new Date(year, month - 1, dom, hours, minutes);
  const exists =
    local.getFullYear() === year &&
    local.getMonth() === month - 1 &&
    local.getDate() === dom &&
    local.getHours() === hours &&
    local.getMinutes() === minutes;
  if (!exists) return null;
  const offsetMinutes = -local.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offset = `${sign}${pad(Math.trunc(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`;
  return `${date}T${time}:00${offset}`;
}

/**
 * The user's UTC offset on a given local date, for display next to the time picker.
 *
 * @param date Local calendar date, `YYYY-MM-DD`; defaults to now when empty or invalid.
 * @returns For example `UTC+01:00`.
 */
export function describeUtcOffset(date: string): string {
  const iso = toOffsetIso(date, "12:00") ?? toOffsetIso(todayLocal(), "12:00");
  return `UTC${iso?.slice(-6) ?? "+00:00"}`;
}

/**
 * Today's local calendar date.
 *
 * @returns `YYYY-MM-DD` in the user's timezone.
 */
export function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whether a key can be picked, and the short reason shown when it cannot. */
export type KeyEligibility = Readonly<{ eligible: boolean; reason: string | null }>;

/**
 * Decides whether a project API key may own a scheduled event. Revoked or inactive keys and keys
 * without the scheduling scope are listed but disabled; the API rejects them too.
 *
 * @param key A project API key from the list endpoint.
 * @returns Whether it is selectable and why not.
 */
export function keyEligibility(
  key: Pick<ProjectApiKey, "isActive" | "revokedAt" | "scopes">,
): KeyEligibility {
  if (key.revokedAt !== null) return { eligible: false, reason: "Revoked" };
  if (!key.isActive) return { eligible: false, reason: "Inactive" };
  if (!key.scopes.includes(SCHEDULE_SCOPE)) {
    return { eligible: false, reason: `Needs ${SCHEDULE_SCOPE}` };
  }
  return { eligible: true, reason: null };
}

/**
 * Parses the payload field. Empty means no variables.
 *
 * @param text Raw textarea contents.
 * @returns The parsed object, or a message to show under the field.
 */
export function parsePayload(text: string): { value: Record<string, unknown> } | { error: string } {
  if (!text.trim()) return { value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "Payload must be valid JSON." };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: 'Payload must be a JSON object, like {"name": "Ada"}.' };
  }
  return { value: parsed as Record<string, unknown> };
}

/** A blank recipient row for the given React key. */
export function emptyRecipient(id: string): RecipientDraft {
  return { id, userId: "", channels: ["email"], email: "", phone: "", webhookUrl: "" };
}

const trimmed = (value: string) => {
  const text = value.trim();
  return text === "" ? undefined : text;
};

/**
 * Turns the form into an API request, checking only what makes a request pointless to send
 * (missing key, type, content, time, or unparseable payload). Address formats, template names and
 * the future-time rule are the API's to judge, and its answers are shown inline.
 *
 * @param state Current form values.
 * @returns The request, or the problems to show.
 */
export function buildScheduleRequest(
  state: ScheduleFormState,
): { input: ScheduledEventCreate } | { errors: FieldErrors } {
  const errors: Record<string, string> = {};
  if (!state.apiKeyId) errors.apiKeyId = "Choose the API key this event is sent as.";
  if (!state.eventType.trim()) errors.eventType = "Enter an event type, like renewal.reminder.";
  if (state.source === "template" && !state.templateName.trim()) {
    errors.templateName = "Choose a template.";
  }
  if (state.source === "inline" && !state.html.trim()) errors.html = "Enter the email body.";
  const scheduledFor = toOffsetIso(state.date, state.time);
  if (!scheduledFor) errors.scheduledFor = "Pick a date and time.";
  state.recipients.forEach((recipient, index) => {
    if (recipient.channels.length === 0) {
      errors[`recipients.${index}.channels`] = "Choose at least one channel.";
    }
  });
  const payload = parsePayload(state.payload);
  if ("error" in payload) errors.payload = payload.error;
  if (Object.keys(errors).length > 0 || !scheduledFor || "error" in payload) return { errors };

  return {
    input: {
      apiKeyId: state.apiKeyId,
      eventType: state.eventType.trim(),
      priority: state.priority,
      scheduledFor,
      recipients: state.recipients.map((recipient) => ({
        userId: trimmed(recipient.userId),
        channels: recipient.channels,
        email: recipient.channels.includes("email") ? trimmed(recipient.email) : undefined,
        phone: recipient.channels.includes("sms") ? trimmed(recipient.phone) : undefined,
        webhookUrl: recipient.channels.includes("webhook")
          ? trimmed(recipient.webhookUrl)
          : undefined,
      })),
      ...(state.source === "template"
        ? { templateName: state.templateName.trim() }
        : {
            inline: {
              html: state.html,
              subject: trimmed(state.subject),
              text: trimmed(state.text),
            },
          }),
      payload: payload.value,
    },
  };
}

const API_FIELD_TO_FORM: Readonly<Record<string, string>> = {
  api_key_id: "apiKeyId",
  event_type: "eventType",
  priority: "priority",
  scheduled_for: "scheduledFor",
  template_name: "templateName",
  template_id: "templateName",
  "inline.html": "html",
  "inline.subject": "subject",
  "inline.text": "text",
  inline: "html",
  payload: "payload",
  metadata: "payload",
};

function cleanMessage(message: string): string {
  return message.replace(/^Value error,\s*/i, "");
}

/** Where an unlabelled server message belongs, judging by what it talks about. */
function fieldForMessage(message: string): string | null {
  if (/^API key\b/i.test(message)) return "apiKeyId";
  if (/^Template with name\b/i.test(message)) return "templateName";
  if (/scheduled_for/i.test(message)) return "scheduledFor";
  return null;
}

/**
 * Sorts the API's validation issues into per-field messages and a general list.
 *
 * Field paths come from the API (`recipients.0.email`); form keys are camel-cased
 * (`apiKeyId`, `scheduledFor`). Issues without a field are routed by what they mention, and
 * whatever is left is returned as general messages for the alert above the form.
 *
 * @param issues Issues from a failed request.
 * @returns Messages by form field, plus those that belong to no single field.
 */
export function routeIssues(issues: readonly ControlPlaneIssue[]): {
  fields: FieldErrors;
  general: string[];
} {
  const fields: Record<string, string> = {};
  const general: string[] = [];
  for (const issue of issues) {
    const message = cleanMessage(issue.message);
    const target =
      (issue.field && (API_FIELD_TO_FORM[issue.field] ?? recipientField(issue.field))) ||
      fieldForMessage(message);
    if (target && !(target in fields)) fields[target] = message;
    else if (!target) general.push(message);
  }
  return { fields, general };
}

function recipientField(field: string): string | null {
  const match = /^recipients\.(\d+)\.(\w+)$/.exec(field);
  if (!match) return null;
  const name =
    match[2] === "webhook_url" ? "webhookUrl" : match[2] === "user_id" ? "userId" : match[2];
  return `recipients.${match[1]}.${name}`;
}
