#!/usr/bin/env python3
"""Exercise login, project credentials, event ingestion, and email delivery."""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent


def env() -> dict[str, str]:
    return dict(
        line.split("=", 1)
        for line in (ROOT / ".env").read_text().splitlines()
        if line and not line.startswith("#") and "=" in line
    )


def request(
    method: str,
    url: str,
    body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raise RuntimeError(
            f"{method} {url} failed ({exc.code}): {exc.read().decode()}"
        ) from exc


def messages(mailpit: str) -> list[dict[str, Any]]:
    return request("GET", f"{mailpit}/api/v1/messages")["messages"]


def wait_for(predicate, timeout: int, message: str):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if result := predicate():
            return result
        time.sleep(0.5)
    raise RuntimeError(message)


def main() -> None:
    config = env()
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--api", default=f"http://localhost:{config.get('API_PORT', '8000')}"
    )
    parser.add_argument(
        "--mailpit", default=f"http://localhost:{config.get('MAILPIT_UI_PORT', '8025')}"
    )
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()
    base = f"{args.api.rstrip('/')}/api/v1"
    email = f"smoke-{int(time.time())}@beaco.local"

    request("POST", f"{base}/auth/magic-link/request", {"email": email})

    def magic_message():
        return next(
            (
                item
                for item in messages(args.mailpit)
                if item.get("Subject") == "Your private link to Beaco"
                and any(
                    recipient.get("Address") == email
                    for recipient in item.get("To", [])
                )
            ),
            None,
        )

    magic = wait_for(magic_message, args.timeout, "magic-link email was not captured")
    detail = request("GET", f"{args.mailpit}/api/v1/message/{magic['ID']}")
    match = re.search(r"[?&]token=([^\s&<>]+)", detail.get("Text", ""))
    if not match:
        raise RuntimeError("magic-link token was not found")
    tokens = request(
        "POST", f"{base}/auth/magic-link/verify", {"token": unquote(match.group(1))}
    )
    bearer = {"Authorization": f"Bearer {tokens['access_token']}"}

    organizations = request("GET", f"{base}/organizations", headers=bearer)
    projects = request(
        "GET", f"{base}/organizations/{organizations[0]['id']}/projects", headers=bearer
    )
    project_id = projects[0]["id"]
    credential = request(
        "POST",
        f"{base}/projects/{project_id}/api-keys",
        {
            "name": "Smoke test",
            "scopes": ["events:read", "events:write"],
            "environment": "test",
        },
        bearer,
    )

    try:
        before = {item["ID"] for item in messages(args.mailpit)}
        event = request(
            "POST",
            f"{base}/events",
            {
                "event_type": "smoke.delivery",
                "recipients": [
                    {"user_id": "smoke-user", "channels": ["email"], "email": email}
                ],
                "priority": "high",
                "payload": {"message": "End-to-end smoke test"},
                "idempotency_key": f"smoke-{int(time.time())}",
            },
            {"X-API-Key": credential["key"]},
        )

        def delivered():
            current = request(
                "GET",
                f"{base}/events/{event['id']}",
                headers={"X-API-Key": credential["key"]},
            )
            return current if current["status"] == "completed" else None

        wait_for(delivered, args.timeout, "event did not complete")
        wait_for(
            lambda: next(
                (
                    item
                    for item in messages(args.mailpit)
                    if item["ID"] not in before
                    and any(
                        recipient.get("Address") == email
                        for recipient in item.get("To", [])
                    )
                ),
                None,
            ),
            args.timeout,
            "delivery email was not captured",
        )
        print(f"Smoke passed: event {event['id']} delivered to {email}")
    finally:
        request(
            "DELETE",
            f"{base}/projects/{project_id}/api-keys/{credential['id']}",
            headers=bearer,
        )


if __name__ == "__main__":
    main()
