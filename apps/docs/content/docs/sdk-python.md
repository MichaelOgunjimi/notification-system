# Python SDK

The official Python SDK publishes and queries Beaco events without adding a runtime dependency. It supports Python 3.9 and newer.

> The SDK uses a secret project API key. Use it only from trusted server code and keep `BEACO_API_KEY` out of source control.

## Installation

The package currently installs from the Beaco repository. A PyPI release can use the same `beaco` package without changing imports.

```bash
uv add "beaco @ git+https://github.com/MichaelOgunjimi/notification-system.git@main#subdirectory=sdks/python"
```

## Publish an Event

```python
import os

from beaco import Beaco

beaco = Beaco(os.environ["BEACO_API_KEY"])

event = beaco.events.publish(
    "user.welcome",
    [{"channels": ["email"], "email": "user@example.com"}],
    payload={"name": "Alice"},
    idempotency_key="welcome-user-123",
)
```

## Query Events

```python
page = beaco.events.list(status="completed", page=1)
event = beaco.events.retrieve("evt_123")
```

Publish a batch atomically with `beaco.events.publish_batch(events)`.

## Available Resources

### Events

```python
beaco.events.publish(event_type, recipients, payload={"name": "Alice"})
beaco.events.publish_batch(events)
beaco.events.retrieve(event_id)
beaco.events.list(status="completed", page=1)
```

Scopes: `events:write` for publishing and `events:read` for retrieving and listing.

### Templates

```python
template = beaco.templates.create(
    "order-shipped",
    "email",
    "Hi {{ name }}, order {{ order_id }} is on its way.",
    subject="Your order has shipped",
    variables=["name", "order_id"],
)

beaco.templates.retrieve(template["id"])
beaco.templates.list(channel="email")
beaco.templates.update(template["id"], subject="Updated subject")
beaco.templates.preview(template["id"], {"name": "Alice", "order_id": "ord_123"})
beaco.templates.delete(template["id"])
```

Scopes: `templates:write` for mutations and `templates:read` for retrieval, listing, and previews.

### Notifications

```python
notification = beaco.notifications.retrieve("ntf_123")
page = beaco.notifications.list(status="failed", channel="email")
```

Scope: `notifications:read`.

### Scheduled Events

```python
scheduled = beaco.scheduled_events.create(
    "renewal.reminder",
    [{"channels": ["email"], "email": "user@example.com"}],
    "2026-10-02T09:00:00Z",
    payload={"renewal_date": "2026-10-03"},
)

beaco.scheduled_events.list(status="pending")
beaco.scheduled_events.cancel(scheduled["id"])
```

Scopes: `scheduled_events:write` for creation and cancellation, and `scheduled_events:read` for listing.

### Suppressions

```python
suppression = beaco.suppressions.create(
    "email",
    "user@example.com",
    reason="manual",
)

beaco.suppressions.list(channel="email")
beaco.suppressions.delete(suppression["id"])
```

Scopes: `suppressions:write` for creation and deletion, and `suppressions:read` for listing.

## Local Development

Loopback HTTP is allowed for local development:

```python
beaco = Beaco(
    os.environ["BEACO_API_KEY"],
    base_url="http://localhost:8000/api/v1",
    timeout=15,
)
```

Remote base URLs must use HTTPS unless `allow_insecure_http=True` is explicitly set.

## Errors

Failed requests raise `BeacoError` with `code`, `status`, `details`, and `retryable` fields:

```python
from beaco import BeacoError

try:
    beaco.events.retrieve("evt_123")
except BeacoError as error:
    if error.retryable:
        print("retry later")
```

All resource methods return decoded API dictionaries. List methods return the standard `items`, `total`, `page`, `per_page`, and `total_pages` fields.
