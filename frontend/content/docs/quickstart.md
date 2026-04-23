# Quickstart

Send your first event with Beacon in minutes.

## 1) Get Your API Key

1. Sign in at `https://beacon.michaelogunjimi.com`
2. Open **Settings → API Keys**
3. Create a **Project key**

Beacon uses `X-API-Key` for authentication on protected endpoints.

Key types:

- **Master key**: Admin operations (settings, global controls)
- **Project key**: Send events and query project data

## 2) Base URL

All API requests use:

```text
https://beacon.michaelogunjimi.com/api/v1
```

## 3) Send Your First Event

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/events \
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
  "event_id": "evt_01j4y8q9w6v0m9xk7k3x7a2p8m",
  "status": "accepted",
  "notification_ids": ["ntf_01j4y8r0j3f0j6g6v9q3m0d2a1"],
  "created_at": "2026-01-12T10:34:11Z"
}
```

## 4) Check Event Status

```bash
curl -X GET https://beacon.michaelogunjimi.com/api/v1/events/EVENT_ID \
  -H "X-API-Key: YOUR_API_KEY"
```

Example response:

```json
{
  "id": "evt_01j4y8q9w6v0m9xk7k3x7a2p8m",
  "event_type": "user.welcome",
  "status": "processing",
  "priority": "medium",
  "created_at": "2026-01-12T10:34:11Z"
}
```

## 5) View Notifications

```bash
curl -X GET https://beacon.michaelogunjimi.com/api/v1/notifications \
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

- [Events](/docs/events)
- [Templates](/docs/templates)
- [Channels](/docs/channels)
- [Delivery Pipeline](/docs/delivery)
- [API Reference](/docs/api-reference)
