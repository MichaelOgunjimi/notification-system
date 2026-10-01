package beaco

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestPublishSendsAuthenticatedSnakeCaseRequest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-API-Key") != "secret" {
			t.Fatal("missing API key")
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
