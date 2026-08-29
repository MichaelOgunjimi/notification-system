# Quickstart

Send your first event with Beaco in minutes.

## 1) Get Your API Key

1. Sign in at `https://beaco.michaelogunjimi.com`
2. Open the organization and project your service belongs to.
3. Create a project API key and grant at least `events:write`.

Beaco uses `X-API-Key` for notification operations. The secret is shown once, so store it in your secret manager rather than source control.

Human sign-in is a separate control plane: bearer access tokens manage organizations, projects, members, invitations, and project API keys. Project API keys authenticate your application and are limited by their assigned scopes.

## 2) Base URL

All API requests use:

```text
https://beaco.michaelogunjimi.com/api/v1
```

## 3) Send Your First Event

```bash
curl -X POST https://beaco.michaelogunjimi.com/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "event_type": "user.welcome",
    "recipients": [{
      "channels": ["email"],
      "email": "user@example.com"
    }],
    "payload": {
      "user_name": "Alice"
    }
  }'
```

Example response:

```json
{
  "id": "3d434cf3-2f63-4a82-aae4-fbead6877445",
  "event_type": "user.welcome",
  "priority": "medium",
  "status": "accepted",
  "recipient_count": 1,
  "has_failures": false,
  "idempotency_key": null,
  "created_at": "2026-01-12T10:34:11Z",
  "updated_at": "2026-01-12T10:34:11Z"
}
```

## 4) Check Event Status

```bash
curl -X GET https://beaco.michaelogunjimi.com/api/v1/events/EVENT_ID \
  -H "X-API-Key: YOUR_API_KEY"
```

Example response:

```json
{
  "id": "3d434cf3-2f63-4a82-aae4-fbead6877445",
  "event_type": "user.welcome",
  "status": "processing",
  "priority": "medium",
  "recipient_count": 1,
  "has_failures": false,
  "notifications": [],
  "created_at": "2026-01-12T10:34:11Z",
  "updated_at": "2026-01-12T10:34:12Z"
}
```

## 5) View Notifications

```bash
curl -X GET https://beaco.michaelogunjimi.com/api/v1/notifications \
  -H "X-API-Key: YOUR_API_KEY"
```

Example response:

```json
{
  "items": [
    {
      "id": "ntf_01j4y8r0j3f0j6g6v9q3m0d2a1",
      "event_id": "evt_01j4y8q9w6v0m9xk7k3x7a2p8m",
      "channel": "email",
      "status": "delivered",
      "created_at": "2026-01-12T10:34:11Z"
    }
  ],
  "total": 1
}
```

## Next Steps

Continue with:

- [Events](/events)
- [Templates](/templates)
- [Channels](/channels)
- [Delivery Pipeline](/delivery)
- [API Reference](/api-reference)
