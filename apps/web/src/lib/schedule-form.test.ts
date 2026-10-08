import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildScheduleRequest,
  describeUtcOffset,
  emptyRecipient,
  keyEligibility,
  parsePayload,
  routeIssues,
  toOffsetIso,
  type ScheduleFormState,
} from "./schedule-form";

afterEach(() => vi.unstubAllEnvs());

describe("toOffsetIso", () => {
  it.each([
    ["Europe/London", "2026-10-20", "09:00", "2026-10-20T09:00:00+01:00"],
    ["Europe/London", "2026-12-20", "09:00", "2026-12-20T09:00:00+00:00"],
    ["America/New_York", "2026-10-20", "18:30", "2026-10-20T18:30:00-04:00"],
    ["America/New_York", "2026-12-20", "18:30", "2026-12-20T18:30:00-05:00"],
    ["Asia/Kolkata", "2026-10-20", "09:00", "2026-10-20T09:00:00+05:30"],
    ["UTC", "2026-10-20", "23:59", "2026-10-20T23:59:00+00:00"],
  ])("in %s turns %s %s into %s", (zone, date, time, expected) => {
    vi.stubEnv("TZ", zone);
    expect(toOffsetIso(date, time)).toBe(expected);
  });

  it("always carries an offset, never a bare local time", () => {
    vi.stubEnv("TZ", "Pacific/Auckland");
    expect(toOffsetIso("2026-10-20", "09:00")).toMatch(/[+-]\d{2}:\d{2}$/);
  });

  it("rejects malformed and non-existent times", () => {
    expect(toOffsetIso("", "09:00")).toBeNull();
    expect(toOffsetIso("2026-10-20", "")).toBeNull();
    expect(toOffsetIso("2026-02-30", "09:00")).toBeNull();
    expect(toOffsetIso("2026-10-20", "25:00")).toBeNull();
    expect(toOffsetIso("20/10/2026", "09:00")).toBeNull();
  });

  it("names the offset in force on the chosen date", () => {
    vi.stubEnv("TZ", "Europe/London");
    expect(describeUtcOffset("2026-07-01")).toBe("UTC+01:00");
    expect(describeUtcOffset("2026-12-01")).toBe("UTC+00:00");
  });
});

describe("keyEligibility", () => {
  const base = { isActive: true, revokedAt: null, scopes: ["scheduled_events:write"] } as const;

  it("accepts an active key with the scheduling scope", () => {
    expect(keyEligibility(base)).toEqual({ eligible: true, reason: null });
  });

  it.each([
    [{ ...base, revokedAt: "2026-10-01T00:00:00Z" }, "Revoked"],
    [{ ...base, isActive: false }, "Inactive"],
    [
      { ...base, scopes: ["events:write", "scheduled_events:read"] },
      "Needs scheduled_events:write",
    ],
  ] as const)("disables %j with %s", (key, reason) => {
    expect(keyEligibility(key)).toEqual({ eligible: false, reason });
  });
});

describe("parsePayload", () => {
  it("treats empty as no variables and accepts objects", () => {
    expect(parsePayload("  ")).toEqual({ value: {} });
    expect(parsePayload('{"name":"Ada"}')).toEqual({ value: { name: "Ada" } });
  });

  it("rejects invalid JSON and non-objects", () => {
    expect(parsePayload("{oops")).toEqual({ error: "Payload must be valid JSON." });
    expect(parsePayload("[1]")).toHaveProperty("error");
    expect(parsePayload("null")).toHaveProperty("error");
    expect(parsePayload('"text"')).toHaveProperty("error");
  });
});

const valid: ScheduleFormState = {
  apiKeyId: "key-1",
  eventType: " renewal.reminder ",
  priority: "high",
  source: "template",
  templateName: "renewal",
  subject: "",
  html: "",
  text: "",
  recipients: [
    { ...emptyRecipient("r1"), email: " a@example.com ", userId: "u1", phone: "ignored" },
  ],
  payload: '{"plan":"pro"}',
  date: "2026-10-20",
  time: "09:00",
};

describe("buildScheduleRequest", () => {
  it("builds a template request with a trimmed, channel-matched recipient", () => {
    vi.stubEnv("TZ", "Europe/London");
    expect(buildScheduleRequest(valid)).toEqual({
      input: {
        apiKeyId: "key-1",
        eventType: "renewal.reminder",
        priority: "high",
        scheduledFor: "2026-10-20T09:00:00+01:00",
        recipients: [
          {
            userId: "u1",
            channels: ["email"],
            email: "a@example.com",
            phone: undefined,
            webhookUrl: undefined,
          },
        ],
        templateName: "renewal",
        payload: { plan: "pro" },
      },
    });
  });

  it("sends inline content instead of a template when chosen", () => {
    const result = buildScheduleRequest({
      ...valid,
      source: "inline",
      subject: "Hi",
      html: "<p>Hi</p>",
    });
    expect(result).toMatchObject({
      input: { inline: { html: "<p>Hi</p>", subject: "Hi", text: undefined } },
    });
    expect(result).not.toHaveProperty("input.templateName");
  });

  it("reports what makes a request pointless", () => {
    const result = buildScheduleRequest({
      ...valid,
      apiKeyId: "",
      eventType: " ",
      templateName: "",
      date: "",
      payload: "{",
      recipients: [{ ...emptyRecipient("r1"), channels: [] }],
    });
    expect(result).toEqual({
      errors: {
        apiKeyId: expect.any(String),
        eventType: expect.any(String),
        templateName: expect.any(String),
        scheduledFor: expect.any(String),
        "recipients.0.channels": expect.any(String),
        payload: "Payload must be valid JSON.",
      },
    });
  });

  it("requires a body for inline content", () => {
    expect(buildScheduleRequest({ ...valid, source: "inline", html: " " })).toEqual({
      errors: { html: expect.any(String) },
    });
  });
});

describe("routeIssues", () => {
  it("maps API field paths to form fields", () => {
    expect(
      routeIssues([
        { field: "recipients.0.email", message: "Invalid email address format" },
        { field: "recipients.2.webhook_url", message: "Webhook URL must use http://" },
        { field: "scheduled_for", message: "Value error, scheduled_for must be a future datetime" },
        { field: "inline.html", message: "String should have at least 1 character" },
        { field: "event_type", message: "Field required" },
      ]),
    ).toEqual({
      fields: {
        "recipients.0.email": "Invalid email address format",
        "recipients.2.webhookUrl": "Webhook URL must use http://",
        scheduledFor: "scheduled_for must be a future datetime",
        html: "String should have at least 1 character",
        eventType: "Field required",
      },
      general: [],
    });
  });

  it("routes unlabelled messages by what they mention and keeps the rest general", () => {
    expect(
      routeIssues([
        { field: null, message: "Template with name 'nope' not found" },
        { field: null, message: "API key 'Live' is revoked or inactive" },
        {
          field: null,
          message: "exactly one of template_id, template_name, or inline is required",
        },
        { field: null, message: "Recipient 'u1' missing 'email' for email channel" },
      ]),
    ).toEqual({
      fields: {
        templateName: "Template with name 'nope' not found",
        apiKeyId: "API key 'Live' is revoked or inactive",
      },
      general: [
        "exactly one of template_id, template_name, or inline is required",
        "Recipient 'u1' missing 'email' for email channel",
      ],
    });
  });
});
