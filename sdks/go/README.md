# Beaco Go SDK

Official standard-library Go SDK for events, templates, notifications, scheduled events, and suppressions.

- [SDK guide](https://beaco-docs.michaelogunjimi.com/sdk-go): every method, with examples
- [API reference](https://beaco-docs.michaelogunjimi.com/api-reference) and [events](https://beaco-docs.michaelogunjimi.com/events)
- [Source](https://github.com/MichaelOgunjimi/notification-system/tree/main/sdks/go) and [issues](https://github.com/MichaelOgunjimi/notification-system/issues)

```bash
go get github.com/MichaelOgunjimi/notification-system/sdks/go
```

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
		Inline: &beaco.InlineEmail{Subject: "Welcome", HTML: "<h1>Welcome, Alice</h1>"},
		// Optional sender: FromLocal: "orders", FromName: "Winwell Orders", ReplyTo: "support@example.com"
	})
	if err != nil {
		panic(err)
	}

	_, _ = client.Templates.Create(context.Background(), beaco.CreateTemplateInput{
		Name: "welcome", Channel: "email", Body: "Hi {{ name }}",
	})
	_, _ = client.Templates.UpsertByName(context.Background(), "welcome", "email", beaco.UpsertTemplateInput{
		Body: "<h1>Hi {{ name }}</h1>",
	})
	_, _ = client.Notifications.Retrieve(context.Background(), "ntf_123")
	_, _ = client.Suppressions.Create(context.Background(), beaco.CreateSuppressionInput{
		Channel: "email", Recipient: "blocked@example.com",
	})
}
```

## Attachments

Attach files to an email event with `Attachments`. Beaco never stores them: the email provider
downloads each `URL` when sending, so the URL must stay reachable until delivery succeeds,
including retries. `SizeBytes` is the size you declare; up to 10 files and 30 MB in total.

```go
_, err := client.Events.Publish(ctx, beaco.PublishEventInput{
	EventType:  "invoice.issued",
	Recipients: []beaco.Recipient{{Channels: []string{"email"}, Email: "user@example.com"}},
	Inline:     &beaco.InlineEmail{Subject: "Your invoice", HTML: "<p>Invoice attached.</p>"},
	Attachments: []beaco.Attachment{
		{Filename: "invoice.pdf", URL: "https://files.example.com/a.pdf", SizeBytes: 48213},
	},
})
```

Invalid attachments return an error before any request is made. Attachments need the Resend email
provider.

Requires Go 1.22 or newer. Keep project API keys in trusted server applications.
