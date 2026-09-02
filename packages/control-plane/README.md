# `@beaco/control-plane`

Reusable browser client and TanStack Query integration for Beaco's authenticated
control-plane operations.

The package owns domain contracts, transport behavior, response mapping, errors,
and cache keys. Applications continue to own their route handlers, cookie-backed
authentication boundary, navigation, and visual components.

## Entry points

- `@beaco/control-plane` — framework-independent client, domain types, and errors
- `@beaco/control-plane/react` — client context, query factories, and React hooks

## Core client

```ts
import { createControlPlaneClient } from "@beaco/control-plane";

const controlPlane = createControlPlaneClient({
  appControlPlanePath: "/api/control-plane",
});

const organizations = await controlPlane.organizations.list();
const projects = await controlPlane.projects.list(organizations[0].id);
const members = await controlPlane.members.list(organizations[0].id);
```

The default client calls the same-origin `/api/control-plane` boundary. A custom
`fetch` implementation and path can be supplied for another application or test.

The client also exposes organization updates, membership roles and removals,
invitations, and project creation/archival. These methods reflect the backend
domain; they do not infer authorization. Use each organization record's
`capabilities` to shape the interface, while treating backend enforcement as the
security boundary.

## React Query

`ControlPlaneProvider` supplies only the domain client. It intentionally does not
create a `QueryClient`, so mount it beneath the application's existing TanStack
`QueryClientProvider`.

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import {
  ControlPlaneProvider,
  useOrganizationMembers,
  useOrganizations,
} from "@beaco/control-plane/react";

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ControlPlaneProvider>{children}</ControlPlaneProvider>
    </QueryClientProvider>
  );
}

function OrganizationList() {
  const organizations = useOrganizations();
  // Render the application-specific interface here.
}
```

The package does not depend on `@beaco/auth`. A host application wires the auth
adapter to explicit server routes, keeping token custody and business-domain
operations independently reusable.
