#!/usr/bin/env python3
"""Configure an isolated Docker Compose project for the current worktree."""

from __future__ import annotations

import argparse
import re
import socket
import subprocess
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
WEB_ENV_FILE = ROOT / "apps/web/.env.local"
TUNNEL_CREDENTIALS = ROOT / "cloudflared/credentials.json"
PORT_KEYS = (
    "FRONTEND_PORT",
    "DOCS_PORT",
    "API_PORT",
    "MAILPIT_UI_PORT",
    "MAILPIT_SMTP_PORT",
    "FLOWER_PORT",
    "POSTGRES_HOST_PORT",
    "REDIS_HOST_PORT",
)
PORT_PREFIXES = tuple(range(30, 38))


def slug(value: str) -> str:
    """Return a Compose-safe project name."""
    value = re.sub(r"[^a-z0-9_-]+", "-", value.lower()).strip("-_")
    return value[:63] or "notification-system-worktree"


def branch_fragment(value: str) -> str:
    """Return about ten characters without cutting the final branch-name word."""
    prefix = value[:10]
    if len(value) > 10 and value[10] not in "-_":
        boundary = max(prefix.rfind("-"), prefix.rfind("_"))
        return prefix[:boundary] if boundary >= 0 else re.split(r"[-_]", value, 1)[0]
    return prefix.rstrip("-_")


def project_name(worktree_name: str) -> str:
    """Return a short project name, including an issue number when available."""
    branch = slug(worktree_name.rsplit("/", 1)[-1])
    issue = re.search(r"(?:^|-)(\d+)(?:-|$)", branch)
    if not issue:
        return slug(f"beaco-{branch_fragment(branch)}")
    summary = re.sub(rf"(?:^|-){issue.group(1)}(?:-|$)", "-", branch).strip("-_")
    return slug(f"beaco-{issue.group(1)}-{branch_fragment(summary)}")


def default_name() -> str:
    """Derive the project name from the repository and branch or worktree directory."""
    branch = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    worktree_name = branch or ROOT.parent.name
    return project_name(worktree_name)


def read_env(path: Path) -> dict[str, str]:
    """Read simple KEY=value entries without interpreting secrets."""
    if not path.exists():
        return {}
    return {
        match.group(1): match.group(2)
        for line in path.read_text().splitlines()
        if (match := re.match(r"^([A-Z][A-Z0-9_]*)=(.*)$", line))
    }


def free(port: int) -> bool:
    """Return whether a host TCP port can be bound."""
    with socket.socket() as sock:
        try:
            sock.bind(("0.0.0.0", port))
        except OSError:
            return False
    return True


def ports_for_suffix(suffix: int) -> tuple[int, ...]:
    """Map one three-digit suffix to every service's host port."""
    return tuple(prefix * 1000 + suffix for prefix in PORT_PREFIXES)


def existing_suffix(env: dict[str, str]) -> int | None:
    """Return the shared suffix when existing ports use the expected scheme."""
    try:
        ports = tuple(int(env[key]) for key in PORT_KEYS)
    except (KeyError, ValueError):
        return None
    suffixes = {port % 1000 for port in ports}
    if tuple(port // 1000 for port in ports) == PORT_PREFIXES and len(suffixes) == 1:
        return suffixes.pop()
    return None


def resolve_name(requested: str | None, existing: dict[str, str]) -> str:
    """Prefer an explicit name, then a valid existing worktree assignment."""
    if requested:
        return slug(requested)
    if existing.get("COMPOSE_PROJECT_NAME") and existing_suffix(existing) is not None:
        return existing["COMPOSE_PROJECT_NAME"]
    return default_name()


def allocate_suffix(name: str) -> int:
    """Find a deterministic free three-digit port suffix."""
    # ponytail: ports are checked, not reserved; add a file lock if worktrees are created concurrently.
    start = zlib.crc32(name.encode()) % 1000
    for offset in range(1000):
        suffix = (start + offset) % 1000
        if all(free(port) for port in ports_for_suffix(suffix)):
            return suffix
    raise SystemExit("No free port suffix found")


def update_env(
    path: Path, values: dict[str, str], template: Path | None = None
) -> None:
    """Upsert values while preserving every other environment entry."""
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(template.read_text() if template else "")
    lines = path.read_text().splitlines()
    found: set[str] = set()
    for index, line in enumerate(lines):
        key = line.partition("=")[0]
        if key in values:
            lines[index] = f"{key}={values[key]}"
            found.add(key)
    if missing := [key for key in values if key not in found]:
        lines.extend(["", "# Worktree Docker Compose"])
        lines.extend(f"{key}={values[key]}" for key in missing)
    path.write_text("\n".join(lines) + "\n")


def link_tunnel_credentials(source: Path, destination: Path) -> bool:
    """Link shared tunnel credentials when this worktree does not have them."""
    if destination.exists() or destination.is_symlink() or not source.is_file():
        return False
    destination.symlink_to(source)
    return True


def main() -> None:
    """Configure this worktree and print its local service URLs."""
    parser = argparse.ArgumentParser()
    parser.add_argument("name", nargs="?", help="optional Compose project name")
    parser.add_argument("--suffix", help="three-digit shared host-port suffix")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    existing = read_env(ENV_FILE)
    name = resolve_name(args.name, existing)
    if args.suffix:
        if not re.fullmatch(r"\d{3}", args.suffix):
            parser.error("--suffix must be exactly three digits")
        suffix = int(args.suffix)
        ports = ports_for_suffix(suffix)
        occupied = (
            {existing.get(key) for key in PORT_KEYS}
            if existing.get("COMPOSE_PROJECT_NAME") == name
            else set()
        )
        if blocked := [
            port for port in ports if not free(port) and str(port) not in occupied
        ]:
            parser.error(f"ports already in use: {', '.join(map(str, blocked))}")
    elif (
        existing.get("COMPOSE_PROJECT_NAME") == name
        and (suffix := existing_suffix(existing)) is not None
    ):
        ports = ports_for_suffix(suffix)
    else:
        suffix = allocate_suffix(name)
        ports = ports_for_suffix(suffix)
    values = {"COMPOSE_PROJECT_NAME": name, **dict(zip(PORT_KEYS, map(str, ports)))}
    if not args.dry_run:
        update_env(ENV_FILE, values, ROOT / ".env.example")
        update_env(
            WEB_ENV_FILE,
            {
                "BACKEND_URL": f"http://localhost:{values['API_PORT']}",
                "NEXT_PUBLIC_API_URL": f"http://localhost:{values['API_PORT']}/api/v1",
                "NEXT_PUBLIC_DOCS_URL": f"http://localhost:{values['DOCS_PORT']}",
                "NEXT_PUBLIC_SITE_URL": f"http://localhost:{values['FRONTEND_PORT']}",
            },
        )
        common_git_dir = Path(
            subprocess.run(
                ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
        )
        shared_credentials = common_git_dir.parent / "cloudflared/credentials.json"
        linked_credentials = link_tunnel_credentials(
            shared_credentials, TUNNEL_CREDENTIALS
        )

    print(f"Compose project: {name}")
    print(f"Port suffix: {suffix:03d}")
    for key, port in zip(PORT_KEYS, ports):
        print(f"{key}={port}")
    if not args.dry_run:
        print(f"\nWrote: {ENV_FILE}")
        print(f"Wrote: {WEB_ENV_FILE}")
        if linked_credentials:
            print(f"Linked: {TUNNEL_CREDENTIALS}")
    print(f"\nStart: cd '{ROOT}' && docker compose up -d --build")


if __name__ == "__main__":
    main()
