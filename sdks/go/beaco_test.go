package beaco

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPublishSendsAuthenticatedSnakeCaseRequest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-API-Key") != "secret" {
			t.Fatal("missing API key")
		}
		if ua := r.Header.Get("User-Agent"); !strings.HasPrefix(ua, "beaco-go/") {
			t.Fatalf("unexpected User-Agent %q", ua)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["event_type"] != "user.welcome" {
			t.Fatalf("unexpected body: %#v", body)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"id":"evt_123","status":"accepted"}`))
	}))
	defer server.Close()

	client, err := New("secret", &Options{BaseURL: server.URL})
	if err != nil {
		t.Fatal(err)
	}
	event, err := client.Events.Publish(context.Background(), PublishEventInput{
		EventType:  "user.welcome",
		Recipients: []Recipient{{Channels: []string{"email"}, Email: "user@example.com"}},
		Inline:     &InlineEmail{Subject: "Welcome", HTML: "<p>Welcome</p>"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if event.ID != "evt_123" {
		t.Fatalf("unexpected event: %#v", event)
	}
}

func TestRejectsInsecureRemoteBaseURL(t *testing.T) {
	if _, err := New("secret", &Options{BaseURL: "http://api.example.com/v1"}); err == nil {
		t.Fatal("expected insecure base URL error")
	}
}

func TestAllResourceGroupsUseExpectedRoutes(t *testing.T) {
	seen := map[string]bool{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen[r.Method+" "+r.URL.Path] = true
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/templates":
			_, _ = w.Write([]byte(`{"id":"tpl_1","name":"welcome","channel":"email","body":"Hi"}`))
		case "/templates/by-name/welcome":
			_, _ = w.Write([]byte(`{"id":"tpl_1","name":"welcome","channel":"email","body":"Hi"}`))
		case "/templates/import":
			_, _ = w.Write([]byte(`{"template":{"id":"tpl_2"},"preview":{"html":"Hi Ada"}}`))
		case "/notifications/ntf_1":
			_, _ = w.Write([]byte(`{"id":"ntf_1","event_id":"evt_1","channel":"email","status":"delivered","notification_logs":[]}`))
		case "/scheduled-events":
			_, _ = w.Write([]byte(`{"id":"sch_1","event_type":"renewal.reminder","status":"pending"}`))
		case "/suppressions":
			_, _ = w.Write([]byte(`{"id":"sup_1","channel":"email","recipient":"blocked@example.com"}`))
		case "/suppressions/sup_1":
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Fatalf("unexpected route: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	client, err := New("secret", &Options{BaseURL: server.URL})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if _, err = client.Templates.Create(ctx, CreateTemplateInput{Name: "welcome", Channel: "email", Body: "Hi"}); err != nil {
		t.Fatal(err)
	}
	if _, err = client.Templates.UpsertByName(ctx, "welcome", "email", UpsertTemplateInput{Body: "Hi"}); err != nil {
		t.Fatal(err)
	}
	if _, err = client.Templates.ImportHTML(ctx, ImportTemplateInput{Name: "imported", HTML: "<p>Hi Ada</p>", Variables: map[string]string{"name": "Ada"}}); err != nil {
		t.Fatal(err)
	}
	if _, err = client.Notifications.Retrieve(ctx, "ntf_1"); err != nil {
		t.Fatal(err)
	}
	if _, err = client.ScheduledEvents.Create(ctx, CreateScheduledEventInput{
		EventType: "renewal.reminder", ScheduledFor: time.Now().Add(time.Hour),
		Inline:     &InlineEmail{HTML: "<p>Hi</p>"},
		Recipients: []Recipient{{Channels: []string{"email"}, Email: "user@example.com"}},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err = client.Suppressions.Create(ctx, CreateSuppressionInput{Channel: "email", Recipient: "blocked@example.com"}); err != nil {
		t.Fatal(err)
	}
	if err = client.Suppressions.Delete(ctx, "sup_1"); err != nil {
		t.Fatal(err)
	}

	for _, route := range []string{
		"POST /templates", "PUT /templates/by-name/welcome", "POST /templates/import",
		"GET /notifications/ntf_1", "POST /scheduled-events",
		"POST /suppressions", "DELETE /suppressions/sup_1",
	} {
		if !seen[route] {
			t.Errorf("route not called: %s", route)
		}
	}
}

func TestInlineEmailAndTemplateCarrySenderFields(t *testing.T) {
	var bodies []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		bodies = append(bodies, body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"id":"x","from_local":"billing"}`))
	}))
	defer server.Close()

	client, err := New("secret", &Options{BaseURL: server.URL})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	if _, err := client.Events.Publish(ctx, PublishEventInput{
		EventType:  "order.confirmed",
		Recipients: []Recipient{{Channels: []string{"email"}, Email: "user@example.com"}},
		Inline: &InlineEmail{
			Subject:   "Order confirmed",
			HTML:      "<p>Thanks</p>",
			FromLocal: "orders",
			FromName:  "Winwell Orders",
			ReplyTo:   "support@winwell.example",
		},
	}); err != nil {
		t.Fatal(err)
	}
	inline, _ := bodies[0]["inline"].(map[string]any)
	if inline["from_local"] != "orders" || inline["from_name"] != "Winwell Orders" || inline["reply_to"] != "support@winwell.example" {
		t.Fatalf("inline sender fields missing: %#v", inline)
	}

	if _, err := client.Templates.Create(ctx, CreateTemplateInput{
		Name: "order-confirmed", Channel: "email", Body: "<p>Hi</p>",
		FromLocal: "billing", FromName: "Acme Billing", ReplyTo: "help@acme.example",
	}); err != nil {
		t.Fatal(err)
	}
	if bodies[1]["from_local"] != "billing" || bodies[1]["from_name"] != "Acme Billing" || bodies[1]["reply_to"] != "help@acme.example" {
		t.Fatalf("template sender fields missing: %#v", bodies[1])
	}

	empty := ""
	template, err := client.Templates.Update(ctx, "tpl_1", UpdateTemplateInput{FromLocal: &empty})
	if err != nil {
		t.Fatal(err)
	}
	if v, ok := bodies[2]["from_local"]; !ok || v != "" {
		t.Fatalf("expected empty from_local to clear the field: %#v", bodies[2])
	}
	if _, ok := bodies[2]["from_name"]; ok {
		t.Fatalf("unset sender fields must be omitted: %#v", bodies[2])
	}
	if template.FromLocal == nil || *template.FromLocal != "billing" {
		t.Fatalf("unexpected template: %#v", template)
	}
}

func TestPublishAttachments(t *testing.T) {
	var body map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"id":"x"}`))
	}))
	defer server.Close()

	client, err := New("secret", &Options{BaseURL: server.URL})
	if err != nil {
		t.Fatal(err)
	}
	input := func(a ...Attachment) PublishEventInput {
		return PublishEventInput{
			EventType:   "order.confirmed",
			Recipients:  []Recipient{{Channels: []string{"email"}, Email: "user@example.com"}},
			Inline:      &InlineEmail{HTML: "<p>Thanks</p>"},
			Attachments: a,
		}
	}
	file := Attachment{Filename: "invoice.pdf", URL: "https://files.example.com/a.pdf", SizeBytes: 1000}

	if _, err := client.Events.Publish(context.Background(), input(file)); err != nil {
		t.Fatal(err)
	}
	sent, _ := body["attachments"].([]any)
	first, _ := sent[0].(map[string]any)
	if first["filename"] != "invoice.pdf" || first["url"] != file.URL || first["size_bytes"] != float64(1000) {
		t.Fatalf("attachment not sent as snake_case: %#v", body["attachments"])
	}

	bad := map[string][]Attachment{
		"ftp url":      {{Filename: "a.pdf", URL: "ftp://files.example.com/a.pdf", SizeBytes: 1}},
		"path in name": {{Filename: "../a.pdf", URL: file.URL, SizeBytes: 1}},
		"zero size":    {{Filename: "a.pdf", URL: file.URL, SizeBytes: 0}},
		"over total":   {{Filename: "a.pdf", URL: file.URL, SizeBytes: 20_000_000}, {Filename: "b.pdf", URL: file.URL, SizeBytes: 20_000_000}},
		"too many":     make([]Attachment, 11),
	}
	for name, attachments := range bad {
		body = nil
		if _, err := client.Events.Publish(context.Background(), input(attachments...)); err == nil {
			t.Fatalf("%s: expected a validation error", name)
		}
		if body != nil {
			t.Fatalf("%s: request must not be sent", name)
		}
	}
}

func TestScheduledEventsRequireOneContentSource(t *testing.T) {
	client, err := New("secret", &Options{BaseURL: "https://api.example.com/v1"})
	if err != nil {
		t.Fatal(err)
	}
	base := CreateScheduledEventInput{
		EventType: "renewal.reminder", ScheduledFor: time.Now().Add(time.Hour),
		Recipients: []Recipient{{Channels: []string{"email"}, Email: "user@example.com"}},
	}
	if _, err = client.ScheduledEvents.Create(context.Background(), base); err == nil {
		t.Fatal("expected an error without a content source")
	}
	both := base
	both.TemplateName = "welcome"
	both.Inline = &InlineEmail{HTML: "<p>Hi</p>"}
	if _, err = client.ScheduledEvents.Create(context.Background(), both); err == nil {
		t.Fatal("expected an error with two content sources")
	}
}
