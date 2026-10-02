# `@beaco/sdk`

Official server-side TypeScript and JavaScript SDK for Beaco.

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

Use `templates.upsertByName()` to sync templates on deploy and `templates.importHtml()` to turn
sample values in existing HTML into template variables.

Requires Node.js 18.17 or newer. This package is server-only: never expose a project API key in browser code.

Request inputs are validated at runtime with Zod. The schemas are exported for JavaScript consumers that want to call `safeParse` directly.

## License

MIT © Michael Ogunjimi
