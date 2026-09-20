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

- Run `make new-worktree` immediately after creating or entering a new worktree. It derives an isolated Compose project name from the branch (including the issue number when the branch is issue-prefixed, such as `feat/67-stop-all`), assigns a free three-digit port suffix, and writes the ignored root `.env` and `apps/web/.env.local` files.
- Re-running `make new-worktree` preserves the worktree's existing Compose name and port suffix.
- Use `make new-worktree name=<compose-name> suffix=<000-999>` when the project name or port suffix must be explicit.
- Start worktree stacks with `docker compose up -d --build`; never reuse or tear down another worktree's Compose project.
- `cloudflared` is intentionally excluded from normal stacks because the shared tunnel would route public traffic to an arbitrary connector. Any checkout may opt in, but only one may run the tunnel at a time: run `make docker-stop-tunnel` in the active checkout before `make docker-up-tunnel` in another.

## Agent skills

### Issue tracker

Issues are tracked in this repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the canonical `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix` labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository with domain language in the root `CONTEXT.md`. See `docs/agents/domain.md`.
