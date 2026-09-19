# Repository Agent Instructions

## Frontend formatting

- Use the repository Prettier configuration for TypeScript, JavaScript, JSON, CSS, Markdown, and YAML.
- Run `npm run format` after frontend edits and `npm run format:check` before committing.
- Do not introduce editor-specific formatting that conflicts with `.prettierrc.json`.

## TypeScript API documentation

- Add accurate JSDoc to every new or changed exported type, interface, class, function, hook, provider, and public method.
- Document parameters, return values, errors, security boundaries, and side effects when they are part of the contract.
- Keep documentation synchronized with behavior when an existing public contract changes.
- Prefer intent-focused documentation over comments that only restate the implementation.

## New worktrees

- Run `make new-worktree` immediately after creating or entering a new worktree. It derives an isolated Compose project name from the branch, assigns a free three-digit port suffix, and writes the ignored root `.env` and `apps/web/.env.local` files.
- Use `make new-worktree name=<compose-name> suffix=<000-999>` when the project name or port suffix must be explicit.
- Start the isolated stack with `docker compose up -d --build`; never reuse or tear down another worktree's Compose project.
