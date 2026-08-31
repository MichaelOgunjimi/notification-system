# Previous dashboard archive

This directory preserves the frontend that existed before the current Beaco web rebuild.
It is a reference archive, not an active application surface.

## What is here

- The previous dashboard route group and its error/layout files
- Dashboard-only API proxy, hooks, types, providers, and client modules
- Dashboard, layout, shared, and UI components used by those routes
- Dashboard layout rules and design tokens in `dashboard-layout.css`
- The former email-template review page and components
- Unused landing-page experiments that depended on the old UI layer

The files retain their original `src`-relative structure where practical so their role and
history remain easy to understand. Imports using the `@/` alias still describe their former
active locations and are not expected to compile inside this archive.

## Active frontend boundary

`apps/web/src` now intentionally contains only:

- The public landing page and public error/metadata surfaces
- Passwordless authentication pages and components
- The reusable authentication SDK under `src/lib/auth`
- Shared brand assets and URL helpers required by those surfaces

The archive is excluded from TypeScript, ESLint, and Docker build contexts.

Dashboard-only packages were also removed from the active `@beaco/web` dependencies. If an
archived module is selected for reuse, reinstall only the packages required by its replacement.

## Reusing something

1. Identify the smallest component or behavior needed for the rebuilt frontend.
2. Move or rewrite it under `apps/web/src` using the new frontend's conventions.
3. Bring back only its necessary dependencies; do not import directly from this archive.
4. Add verification for the active route that consumes it.
5. Delete the archived source only after the replacement is accepted.

Do not add new product code here. This directory exists only to support deliberate extraction
while the frontend is rebuilt.
