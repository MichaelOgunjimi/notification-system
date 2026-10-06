# Beaco Python SDK

Official dependency-free Python SDK for events, templates, notifications, scheduled events, and suppressions.

```bash
uv add "beaco @ git+https://github.com/MichaelOgunjimi/notification-system.git@main#subdirectory=sdks/python"
```

```python
import os

from beaco import Beaco

beaco = Beaco(os.environ["BEACO_API_KEY"])
event = beaco.events.publish(
    "user.welcome",
    [{"channels": ["email"], "email": "user@example.com"}],
    inline={"subject": "Welcome", "html": "<h1>Welcome, Alice</h1>"},
)
# Optional sender: inline={..., "from_local": "orders", "from_name": "Winwell Orders",
#                          "reply_to": "support@example.com"}
# Optional files (never stored; the email provider downloads each url when sending):
#   attachments=[{"filename": "invoice.pdf", "url": "https://files.example.com/a.pdf",
#                 "size_bytes": 48213}]

template = beaco.templates.create("welcome", "email", "Hi {{ name }}")
beaco.templates.upsert_by_name("welcome", "<h1>Hi {{ name }}</h1>")
notification = beaco.notifications.retrieve("ntf_123")
scheduled = beaco.scheduled_events.create(
    "renewal.reminder",
    [{"channels": ["email"], "email": "user@example.com"}],
    "2026-10-02T09:00:00Z",
)
suppression = beaco.suppressions.create("email", "blocked@example.com")
```

Requires Python 3.9 or newer. This package is server-only: never expose a project API key in browser code.
