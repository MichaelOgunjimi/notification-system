# Go SDK

The official Go SDK publishes and queries Beaco events using only the standard library. It supports Go 1.22 and newer.

> The SDK uses a secret project API key. Use it only from trusted server code and keep `BEACO_API_KEY` out of source control.

## Installation

```bash
go get github.com/MichaelOgunjimi/notification-system/sdks/go
```

## Publish an Event

```go
package main

import (
    "context"
    "os"

    beaco "github.com/MichaelOgunjimi/notification-system/sdks/go"
)

func main() {
    client, err := beaco.New(os.Getenv("BEACO_API_KEY"), nil)
    if err != nil {
        panic(err)
    }

    _, err = client.Events.Publish(context.Background(), beaco.PublishEventInput{
        EventType: "user.welcome",
        Recipients: []beaco.Recipient{{
            Channels: []string{"email"},
            Email:    "user@example.com",
        }},
        Payload: map[string]any{"name": "Alice"},
    })
    if err != nil {
        panic(err)
    }
}
```

## Query Events

```go
page, err := client.Events.List(ctx, beaco.EventListOptions{Status: "completed", Page: 1})
event, err := client.Events.Retrieve(ctx, "evt_123")
```

Publish a batch atomically with `client.Events.PublishBatch(ctx, events)`.

## Available Resources

### Events

```go
client.Events.Publish(ctx, input)
client.Events.PublishBatch(ctx, events)
client.Events.Retrieve(ctx, eventID)
client.Events.List(ctx, beaco.EventListOptions{Status: "completed", Page: 1})
```

Scopes: `events:write` for publishing and `events:read` for retrieving and listing.

### Templates

```go
template, err := client.Templates.Create(ctx, beaco.CreateTemplateInput{
    Name:      "order-shipped",
    Channel:   "email",
    Subject:   "Your order has shipped",
    Body:      "Hi {{ name }}, order {{ order_id }} is on its way.",
    Variables: []string{"name", "order_id"},
})

client.Templates.Retrieve(ctx, template.ID)
client.Templates.List(ctx, beaco.TemplateListOptions{Channel: "email"})
client.Templates.Update(ctx, template.ID, beaco.UpdateTemplateInput{Body: "Updated"})
client.Templates.Preview(ctx, template.ID, map[string]any{"name": "Alice"})
client.Templates.Delete(ctx, template.ID)
```

Scopes: `templates:write` for mutations and `templates:read` for retrieval, listing, and previews.

### Notifications

```go
notification, err := client.Notifications.Retrieve(ctx, "ntf_123")
page, err := client.Notifications.List(ctx, beaco.NotificationListOptions{
    Status: "failed",
    Channel: "email",
})
```

Scope: `notifications:read`.

### Scheduled Events

```go
scheduled, err := client.ScheduledEvents.Create(ctx, beaco.CreateScheduledEventInput{
    EventType:    "renewal.reminder",
    ScheduledFor: time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC),
    Recipients: []beaco.Recipient{{
        Channels: []string{"email"},
        Email:    "user@example.com",
    }},
    Payload: map[string]any{"renewal_date": "2026-10-03"},
})

client.ScheduledEvents.List(ctx, beaco.ScheduledEventListOptions{Status: "pending"})
client.ScheduledEvents.Cancel(ctx, scheduled.ID)
```

Scopes: `scheduled_events:write` for creation and cancellation, and `scheduled_events:read` for listing.

### Suppressions

```go
suppression, err := client.Suppressions.Create(ctx, beaco.CreateSuppressionInput{
    Channel:   "email",
    Recipient: "user@example.com",
    Reason:    "manual",
})

client.Suppressions.List(ctx, beaco.SuppressionListOptions{Channel: "email"})
client.Suppressions.Delete(ctx, suppression.ID)
```

Scopes: `suppressions:write` for creation and deletion, and `suppressions:read` for listing.

## Local Development

```go
client, err := beaco.New(os.Getenv("BEACO_API_KEY"), &beaco.Options{
    BaseURL: "http://localhost:8000/api/v1",
})
```

Remote base URLs must use HTTPS unless `AllowInsecureHTTP` is explicitly enabled.

## Errors

Failed requests return `*beaco.Error`, including stable `Code`, `Status`, `Details`, and `Retryable` fields.

List methods return `Page[T]` with `Items`, `Total`, `Page`, `PerPage`, and `TotalPages` fields.
