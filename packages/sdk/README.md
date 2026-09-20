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
  payload: { name: "Alice" },
});
```

Requires Node.js 18 or newer. This package is server-only: never expose a project API key in browser code.

Request inputs are validated at runtime with Zod. The schemas are exported for JavaScript consumers that want to call `safeParse` directly.
