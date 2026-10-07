# TypeScript / JavaScript SDK

`@beaco/sdk` is the official server-side SDK for publishing events and managing the resources used to deliver them. It supports TypeScript and plain JavaScript on Node.js 18.17 or newer.

> The SDK uses a secret project API key. Import it only from trusted server code—never from browser bundles, React client components, or publicly exposed environment variables.

## Installation

```bash
npm install @beaco/sdk
```

## TypeScript

```ts
import { Beaco } from "@beaco/sdk";

const beaco = new Beaco({
  apiKey: process.env.BEACO_API_KEY!,
});
```

TypeScript receives autocomplete and compile-time request and response types from the package.

## JavaScript

JavaScript uses the same package and API without a build step or type annotations:

```js
import { Beaco } from "@beaco/sdk";

const beaco = new Beaco({
  apiKey: process.env.BEACO_API_KEY,
});
```

Request inputs are validated at runtime with Zod, so JavaScript receives the same early feedback as TypeScript:

```js
import { PublishEventInputSchema } from "@beaco/sdk";

const result = PublishEventInputSchema.safeParse(input);
if (!result.success) console.error(result.error.issues);
```

The SDK also validates inputs automatically before making an API request.

## Configuration

The default base URL is `https://beaco.michaelogunjimi.com/api/v1`. Self-hosted and local environments can override it:

```ts
const beaco = new Beaco({
  apiKey: process.env.BEACO_API_KEY!,
  baseUrl: "http://localhost:8000/api/v1",
  timeoutMs: 15_000,
});
```

The SDK sends your API key on every request, so non-loopback `baseUrl`s must use HTTPS. Loopback
hosts (`localhost`, `127.0.0.1`, `::1`) are allowed over plain HTTP for local development. Any
other cleartext HTTP endpoint requires an explicit opt-in:

```ts
const beaco = new Beaco({
  apiKey: process.env.BEACO_API_KEY!,
  baseUrl: "http://internal-beaco.example.net/api/v1",
  allowInsecureHttp: true,
});
```

## Create a Template and Publish an Event

The API key needs `templates:write` to create templates and `events:write` to publish events.

```ts
const template = await beaco.templates.upsertByName("order-shipped", {
  subject: "Your order has shipped",
  body: "<p>Hi {{ name }}, order {{ order_id }} is on its way.</p>",
  textBody: "Hi {{ name }}, order {{ order_id }} is on its way.",
});

const event = await beaco.events.publish({
  eventType: "order.shipped",
  templateId: template.id,
  idempotencyKey: "order-shipped-ord_123",
  recipients: [
    {
      userId: "usr_123",
      channels: ["email"],
      email: "user@example.com",
    },
  ],
  payload: {
    name: "Alice",
    order_id: "ord_123",
  },
});
```

Payload keys are preserved exactly because they are template variables. SDK option names use camelCase and are converted to the REST API format automatically.

## Available Resources

### Events

```ts
await beaco.events.publish(input);
await beaco.events.publishBatch([input]);
await beaco.events.retrieve(eventId);
await beaco.events.list({ status: "completed", page: 1 });
```

Scopes: `events:write` for publishing and `events:read` for retrieving and listing.

### Templates

```ts
await beaco.templates.create(input);
await beaco.templates.upsertByName("order-shipped", input, "email");
await beaco.templates.importHtml({
  name: "welcome",
  html: "<h1>Hi Alice</h1>",
  variables: { name: "Alice" },
});
await beaco.templates.retrieve(templateId);
await beaco.templates.list({ channel: "email" });
await beaco.templates.update(templateId, { subject: "Updated subject" });
await beaco.templates.preview(templateId, { name: "Alice" });
await beaco.templates.delete(templateId);
```

Send content your app already rendered with `inline: { subject, html, text }` instead of a template
reference. Exactly one of `templateId`, `templateName`, or `inline` is required.

Choose the sender with `fromLocal` (the part before the `@`), `fromName`, and `replyTo`. The domain
always stays the server's verified domain; `replyTo` can be any valid address. Templates accept the
same three fields.

```ts
await beaco.events.publish({
  eventType: "order.confirmed",
  recipients: [{ channels: ["email"], email: "chidi@example.com" }],
  inline: {
    subject: "Order BEA-1042 confirmed",
    html: "<h1>Thanks for your order</h1>",
    fromLocal: "orders",
    fromName: "Winwell Orders",
    replyTo: "support@winwell.example",
  },
});
```

Attach files with `attachments: [{ filename, url, sizeBytes }]` on `events.publish` (up to 10, 30 MB
declared in total). Beaco never stores them: the email provider downloads each `url` when sending,
so it must stay reachable until delivery succeeds, including retries. Invalid attachments throw
before any request is made.

```ts
await beaco.events.publish({
  eventType: "order.confirmed",
  recipients: [{ channels: ["email"], email: "chidi@example.com" }],
  inline: { subject: "Your invoice", html: "<p>Attached.</p>" },
  attachments: [
    { filename: "invoice.pdf", url: "https://files.example.com/a.pdf", sizeBytes: 48213 },
  ],
});
```

Scopes: `templates:write` for mutations and `templates:read` for retrieval, listing, and previews.

### Notifications

```ts
await beaco.notifications.retrieve(notificationId);
await beaco.notifications.list({ status: "failed", channel: "email" });
```

Scope: `notifications:read`.

### Scheduled Events

```ts
const scheduled = await beaco.scheduledEvents.create({
  eventType: "renewal.reminder",
  scheduledFor: new Date("2026-10-01T09:00:00Z"),
  recipients: [{ channels: ["email"], email: "user@example.com" }],
  templateName: "renewal-reminder", // or templateId / inline, same as events.publish
  payload: { renewalDate: "2026-10-02" },
});

await beaco.scheduledEvents.list({ status: "pending" });
await beaco.scheduledEvents.cancel(scheduled.id);
```

Scheduled events accept the same content fields as `events.publish` (exactly one of `templateId`,
`templateName` or `inline`, plus optional `attachments`; no `idempotencyKey`). Once `scheduledFor`
arrives the event is dispatched and its `eventId` is set; an event more than an hour overdue is
expired instead of sent. Cancelling is only possible while `status` is `pending`.

Scopes: `scheduled_events:write` for creation and cancellation, and `scheduled_events:read` for listing.

### Suppressions

```ts
const suppression = await beaco.suppressions.create({
  channel: "email",
  recipient: "user@example.com",
  reason: "manual",
});

await beaco.suppressions.list({ channel: "email" });
await beaco.suppressions.delete(suppression.id);
```

Scopes: `suppressions:write` for creation and deletion, and `suppressions:read` for listing.

## Next.js

Use the SDK from Server Actions, Route Handlers, or other server-only modules:

```ts
import { Beaco } from "@beaco/sdk";

const beaco = new Beaco({ apiKey: process.env.BEACO_API_KEY! });

export async function POST() {
  const event = await beaco.events.publish({
    eventType: "report.ready",
    recipients: [{ channels: ["email"], email: "user@example.com" }],
  });

  return Response.json(event, { status: 202 });
}
```

Do not add `NEXT_PUBLIC_` to the API-key environment variable and do not import the SDK from a file marked `"use client"`.

## Errors and Cancellation

Failed requests throw `BeacoError`:

```ts
import { BeacoError } from "@beaco/sdk";

try {
  await beaco.events.publish(input);
} catch (error) {
  if (error instanceof BeacoError) {
    console.error(error.code, error.status, error.details);
    if (error.retryable) {
      // Retry later using the same idempotency key.
    }
  }
}
```

Every operation accepts an optional `AbortSignal`:

```ts
await beaco.events.publish(input, {
  signal: AbortSignal.timeout(5_000),
});
```
