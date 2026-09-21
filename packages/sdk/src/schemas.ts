import { z } from "zod";

const channel = z.enum(["email", "sms", "webhook"]);
const priority = z.enum(["high", "medium", "low"]);

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
    payload: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    idempotencyKey: z.string().min(1).max(255).optional(),
  })
  .strict();

/** Runtime schema for a template creation request. */
export const CreateTemplateInputSchema = z
  .object({
    name: z.string().min(1).max(255),
    channel,
    subject: z.string().max(500).optional(),
    body: z.string().min(1),
    variables: z.array(z.string()).optional(),
  })
  .strict();

/** Runtime schema for a template update request. */
export const UpdateTemplateInputSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    channel: channel.optional(),
    subject: z.string().max(500).nullable().optional(),
    body: z.string().min(1).optional(),
    variables: z.array(z.string()).optional(),
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
