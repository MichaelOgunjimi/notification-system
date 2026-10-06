import { z } from "zod";

const channel = z.enum(["email", "sms", "webhook"]);
const priority = z.enum(["high", "medium", "low"]);
const missingVariablePolicy = z.enum(["error", "blank"]);

/** Local part only: the sending domain always comes from the Beaco server. */
const fromLocal = z
  .string()
  .max(64)
  .regex(/^[a-z0-9._+-]+$/, "fromLocal must be lowercase letters, digits, '.', '_', '+' or '-'");
// Plain text: no C0/C1 control characters, newlines, or Unicode line separators.
const fromName = z
  .string()
  .max(100)
  .regex(/^[^\u0000-\u001f\u007f-\u009f\u2028\u2029]*$/, "fromName must be plain text");
const replyTo = z.email().max(320);

/** Runtime schema for already-rendered inline email content. */
export const InlineEmailSchema = z
  .object({
    subject: z.string().max(500).optional(),
    html: z.string().min(1),
    text: z.string().optional(),
    fromLocal: fromLocal.optional(),
    fromName: fromName.optional(),
    replyTo: replyTo.optional(),
  })
  .strict();

/** Largest total of declared attachment sizes: Resend's 40 MB email limit after Base64 encoding. */
export const MAX_ATTACHMENT_BYTES = 30_000_000;

/** Runtime schema for an email attachment referenced by URL. */
export const AttachmentSchema = z
  .object({
    filename: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[^/\\\u0000-\u001f]+$/, "filename must not contain slashes or control characters"),
    url: z.url({ protocol: /^https?$/ }).max(2048),
    sizeBytes: z.number().int().positive(),
  })
  .strict();

/** Runtime schema for an event recipient. */
export const RecipientSchema = z
  .object({
    userId: z.string().optional(),
    channels: z.array(channel).min(1),
    email: z.email().optional(),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{6,14}$/, "Phone must use E.164 format")
      .optional(),
    webhookUrl: z.url().optional(),
  })
  .strict();

/** Runtime schema for an immediate event publication request. */
export const PublishEventInputSchema = z
  .object({
    eventType: z.string().min(1).max(255),
    recipients: z.array(RecipientSchema).min(1),
    priority: priority.optional(),
    templateId: z.string().optional(),
    templateName: z.string().min(1).max(255).optional(),
    inline: InlineEmailSchema.optional(),
    attachments: z.array(AttachmentSchema).max(10).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    idempotencyKey: z.string().min(1).max(255).optional(),
  })
  .strict()
  .refine(
    ({ templateId, templateName, inline }) =>
      [templateId, templateName, inline].filter((value) => value !== undefined).length === 1,
    { message: "Exactly one of templateId, templateName, or inline is required" },
  )
  .refine(
    ({ attachments }) =>
      (attachments ?? []).reduce((total, { sizeBytes }) => total + sizeBytes, 0) <=
      MAX_ATTACHMENT_BYTES,
    { message: `attachments exceed ${MAX_ATTACHMENT_BYTES} bytes in total` },
  );

/** Runtime schema for a template creation request. */
export const CreateTemplateInputSchema = z
  .object({
    name: z.string().min(1).max(255),
    channel,
    subject: z.string().max(500).optional(),
    body: z.string().min(1),
    textBody: z.string().optional(),
    fromLocal: fromLocal.optional(),
    fromName: fromName.optional(),
    replyTo: replyTo.optional(),
    variables: z.array(z.string()).optional(),
    onMissingVariable: missingVariablePolicy.optional(),
  })
  .strict();

/** Runtime schema for a template update request. */
export const UpdateTemplateInputSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    channel: channel.optional(),
    subject: z.string().max(500).nullable().optional(),
    body: z.string().min(1).optional(),
    textBody: z.string().nullable().optional(),
    fromLocal: fromLocal.nullable().optional(),
    fromName: fromName.nullable().optional(),
    replyTo: replyTo.nullable().optional(),
    variables: z.array(z.string()).optional(),
    onMissingVariable: missingVariablePolicy.optional(),
  })
  .strict();

/** Runtime schema for template content synchronized by name. */
export const UpsertTemplateInputSchema = CreateTemplateInputSchema.omit({
  name: true,
  channel: true,
});

/** Runtime schema for importing sample HTML as a template. */
export const ImportTemplateInputSchema = z
  .object({
    name: z.string().min(1).max(255),
    subject: z.string().max(500).optional(),
    html: z.string().min(1),
    variables: z.record(z.string(), z.string()).optional(),
  })
  .strict();

/** Runtime schema for a scheduled event creation request. */
export const CreateScheduledEventInputSchema = z
  .object({
    eventType: z.string().min(1).max(255),
    recipients: z.array(RecipientSchema).min(1),
    scheduledFor: z.union([z.string().min(1), z.date()]),
    priority: priority.optional(),
    templateId: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/** Runtime schema for a suppression creation request. */
export const CreateSuppressionInputSchema = z
  .object({
    channel,
    recipient: z.string().min(1).max(500),
    reason: z.enum(["manual", "hard_bounce", "spam_complaint"]).optional(),
    source: z.enum(["client", "system"]).optional(),
  })
  .strict();
