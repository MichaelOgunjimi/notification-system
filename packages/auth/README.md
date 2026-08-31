# `@beaco/auth`

Beaco's framework-neutral authentication SDK. Applications use this package to create and
observe a human **Session** without reading or persisting access and refresh tokens.

## Package layers

- `@beaco/auth` — typed client, domain models, structured errors, and client seam
- `@beaco/auth/react` — TanStack Query provider, session query, and mutation hooks
- Application adapter — same-origin endpoints that choose how a Session is stored

The SDK ships an HTTP client for the cookie-session endpoint contract used by Beaco web apps.
The `AuthClient` interface is injectable, so native or desktop applications can provide an
adapter backed by Keychain, Keystore, or another platform security facility.

## Browser security model

The browser client deliberately receives `User | null`, never token values. The consuming
application's server stores the short-lived access token and refresh token in `Secure`,
`HttpOnly`, `SameSite=Lax` cookies. This keeps session credentials outside JavaScript and avoids
the XSS exposure of `localStorage` and `sessionStorage`.

The backend OAuth callback redirects with a 60-second, single-use authorization code. The
application server exchanges that code for tokens and writes the cookies. Access and refresh
tokens are never placed in the browser URL.

## React application

```tsx
import { AuthProvider } from "@beaco/auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
```

```tsx
import { useSendMagicLink, useSession } from "@beaco/auth/react";

function SignIn() {
  const session = useSession();
  const sendMagicLink = useSendMagicLink();

  // session.status is loading, authenticated, anonymous, or error.
  // sendMagicLink.mutate({ email: "person@example.com" })
  return null;
}
```

## Imperative application

```ts
import { createAuthClient } from "@beaco/auth";

const auth = createAuthClient({ apiPath: "/api/auth" });
const user = await auth.getCurrentUser();
```

## HTTP adapter contract

The default client expects the consuming application to expose:

- `POST /magic-link/request` → `{ message }`
- `POST /magic-link/verify` → `User`
- `GET /oauth/:provider` → provider redirect
- `POST /oauth/exchange` → `User`
- `GET /session` → `User` or `401`
- `POST /logout` → success response

The base path defaults to `/api/auth` and is configurable through `createAuthClient`.
