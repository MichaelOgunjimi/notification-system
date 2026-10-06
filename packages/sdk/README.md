# `@beaco/sdk`

Official server-side TypeScript and JavaScript SDK for Beaco.

- [SDK guide](https://beaco-docs.michaelogunjimi.com/sdk): every method, with examples
- [API reference](https://beaco-docs.michaelogunjimi.com/api-reference) and [events](https://beaco-docs.michaelogunjimi.com/events)
- [Source](https://github.com/MichaelOgunjimi/notification-system/tree/main/packages/sdk) and [issues](https://github.com/MichaelOgunjimi/notification-system/issues)

```bash
npm install @beaco/sdk
```

```ts
import { Beaco } from "@beaco/sdk";

const beaco = new Beaco({ apiKey: process.env.BEACO_API_KEY! });

await beaco.events.publish({
  eventType: "user.welcome",
  recipients: [{ channels: ["email"], email: "user@example.com" }],
  inline: { subject: "Welcome", html: "<h1>Welcome, Alice</h1>" },
});
```

Pick the sender of an email with `fromLocal`, `fromName`, and `replyTo` on `inline` or a template.
The domain always stays the server's verified domain.

Attach files with `attachments: [{ filename, url, sizeBytes }]` on `events.publish`. Beaco does not store them; the email provider downloads each `url` at send time, so keep it reachable through retries. Up to 10 files, 30 MB declared in total.

Use `templates.upsertByName()` to sync templates on deploy and `templates.importHtml()` to turn
sample values in existing HTML into template variables.

Requires Node.js 18.17 or newer. This package is server-only: never expose a project API key in browser code.

Request inputs are validated at runtime with Zod. The schemas are exported for JavaScript consumers that want to call `safeParse` directly.

## License

MIT © Michael Ogunjimi
