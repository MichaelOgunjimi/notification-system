#!/usr/bin/env python3
"""Configure Docker Compose for the primary checkout or a linked worktree."""

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
# Third-party credentials a worktree may inherit from the primary checkout. An
# explicit list, not "everything": ports, URLs, database settings, and signing
# secrets stay per-worktree, and EMAIL_PROVIDER stays on Mailpit so a worktree
# never sends real mail unless it opts in. Add a key here to share it.
SHARED_KEYS = (
    "RESEND_API_KEY",
    "EMAIL_FROM_ADDRESS",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_FROM_NUMBER",
)
PORT_PREFIXES = tuple(range(30, 38))
PRIMARY_PROJECT_NAME = "notification-system"
PRIMARY_PORTS = (3000, 3001, 8000, 8025, 1025, 5555, 5433, 6379)


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
    normalized_name = re.sub(r"[^a-z0-9_-]+", "-", worktree_name.lower()).strip("-_")
    branch = (
        re.sub(r"[^a-z0-9_-]+", "-", worktree_name.rsplit("/", 1)[-1].lower()).strip(
            "-_"
        )
        or "worktree"
    )
    fingerprint = f"{zlib.crc32((normalized_name or branch).encode()):08x}"
    issue = re.search(r"(?:^|-)(\d+)(?:-|$)", branch)
    if not issue:
        return slug(f"beaco-{branch_fragment(branch)}-{fingerprint}")
    summary = f"{branch[: issue.start()]}-{branch[issue.end() :]}".strip("-_")
    return slug(f"beaco-{issue.group(1)}-{branch_fragment(summary)}-{fingerprint}")


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


def git_path(option: str) -> Path:
    """Resolve one Git metadata path for this checkout."""
    return Path(
        subprocess.run(
            ["git", "rev-parse", "--path-format=absolute", option],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    ).resolve()


def is_primary_checkout() -> bool:
    """Return whether this checkout owns the repository's common Git directory."""
    return git_path("--git-dir") == git_path("--git-common-dir")


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
    # ponytail: ports are checked, not reserved; add a file lock for concurrent setup.
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


def is_unset(value: str | None, placeholder: str | None) -> bool:
    """Treat empty values and untouched `.env.example` placeholders as unset."""
    return not value or value == placeholder


def inheritable(
    source: Path, destination: Path, keys: tuple[str, ...], example: Path
) -> list[str]:
    """Return the `keys` the primary has a real value for and `destination` lacks."""
    primary, own, placeholders = (
        read_env(source),
        read_env(destination),
        read_env(example),
    )
    return [
        key
        for key in keys
        if not is_unset(primary.get(key), placeholders.get(key))
        and is_unset(own.get(key), placeholders.get(key))
    ]


def inherit_env(
    source: Path, destination: Path, keys: tuple[str, ...], example: Path
) -> list[str]:
    """Fill the listed `keys` that are unset in `destination` from `source`.

    Existing real values are never overwritten, and only key names are returned —
    values are never printed.
    """
    if not source.is_file() or not destination.is_file():
        return []
    filled = inheritable(source, destination, keys, example)
    if not filled:
        return []
    primary = read_env(source)
    lines = destination.read_text().splitlines()
    present: set[str] = set()
    for index, line in enumerate(lines):
        key = line.partition("=")[0]
        if key in filled:
            lines[index] = f"{key}={primary[key]}"
            present.add(key)
    if appended := [key for key in filled if key not in present]:
        lines.extend(["", "# Inherited from the primary checkout"])
        lines.extend(f"{key}={primary[key]}" for key in appended)
    destination.write_text("\n".join(lines) + "\n")
    return filled


def inherit_from_primary(primary: bool, dry_run: bool, only: tuple[str, ...]) -> int:
    """Run the --inherit step; returns a process exit status."""
    if primary:
        print("This is the primary checkout — there is nothing to inherit from.")
        return 0
    source = git_path("--git-common-dir").parent / ".env"
    example = ROOT / ".env.example"
    keys = only or SHARED_KEYS
    if not source.is_file():
        print(f"skip    .env (no primary file at {source})")
        return 1
    if not ENV_FILE.is_file():
        print("skip    .env (missing here — run `make new-worktree` first)")
        return 1
    if dry_run:
        would = inheritable(source, ENV_FILE, keys, example)
        print(f"would inherit .env: {', '.join(would) or 'nothing'}")
        return 0
    filled = inherit_env(source, ENV_FILE, keys, example)
    for key in filled:
        print(f"inherit .env {key} (from the primary checkout)")
    if not filled:
        print("ok      .env (already up to date)")
    return 0


def main() -> None:
    """Configure this worktree and print its local service URLs."""
    parser = argparse.ArgumentParser()
    parser.add_argument("name", nargs="?", help="optional Compose project name")
    parser.add_argument("--suffix", help="three-digit shared host-port suffix")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--inherit",
        action="store_true",
        help="only fill unset shared credentials in this worktree's .env from the "
        "primary checkout's (ports and URLs are left alone)",
    )
    parser.add_argument(
        "--key",
        action="append",
        default=[],
        metavar="NAME",
        help="with --inherit: inherit only this key (repeatable) instead of the "
        "default shared-credentials list",
    )
    args = parser.parse_args()
    if args.key and not args.inherit:
        parser.error("--key only applies with --inherit")

    primary = is_primary_checkout()
    if args.inherit:
        raise SystemExit(inherit_from_primary(primary, args.dry_run, tuple(args.key)))
    existing = read_env(ENV_FILE)
    if primary and not args.name and not args.suffix:
        name = PRIMARY_PROJECT_NAME
        suffix = None
        ports = PRIMARY_PORTS
    else:
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
    values.update(
        SMTP_HOST="localhost",
        SMTP_PORT=values["MAILPIT_SMTP_PORT"],
    )
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
        common_root = git_path("--git-common-dir").parent
        shared_credentials = common_root / "cloudflared/credentials.json"
        linked_credentials = link_tunnel_credentials(
            shared_credentials, TUNNEL_CREDENTIALS
        )
        inherited = (
            []
            if primary
            else inherit_env(
                common_root / ".env", ENV_FILE, SHARED_KEYS, ROOT / ".env.example"
            )
        )

    print(f"Compose project: {name}")
    print(f"Port suffix: {suffix:03d}" if suffix is not None else "Ports: canonical")
    for key, port in zip(PORT_KEYS, ports):
        print(f"{key}={port}")
    if not args.dry_run:
        print(f"\nWrote: {ENV_FILE}")
        print(f"Wrote: {WEB_ENV_FILE}")
        if linked_credentials:
            print(f"Linked: {TUNNEL_CREDENTIALS}")
        for key in inherited:
            print(f"Inherited: {key} (from the primary checkout)")
    print(f"\nStart: cd '{ROOT}' && make up")


if __name__ == "__main__":
    main()
