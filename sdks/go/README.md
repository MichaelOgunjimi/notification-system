# Beaco Go SDK

Official standard-library Go SDK for events, templates, notifications, scheduled events, and suppressions.

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

Requires Go 1.22 or newer. Keep project API keys in trusted server applications.
