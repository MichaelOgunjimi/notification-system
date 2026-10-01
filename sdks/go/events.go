package beaco

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strconv"
)

// Recipient identifies one notification recipient and its delivery channels.
type Recipient struct {
	UserID     string   `json:"user_id,omitempty"`
	Channels   []string `json:"channels"`
	Email      string   `json:"email,omitempty"`
	Phone      string   `json:"phone,omitempty"`
	WebhookURL string   `json:"webhook_url,omitempty"`
}

// PublishEventInput contains an event and its delivery controls.
type PublishEventInput struct {
	EventType      string         `json:"event_type"`
	Recipients     []Recipient    `json:"recipients"`
	Priority       string         `json:"priority,omitempty"`
	TemplateID     string         `json:"template_id,omitempty"`
	TemplateName   string         `json:"template_name,omitempty"`
	Payload        map[string]any `json:"payload,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
	IdempotencyKey string         `json:"idempotency_key,omitempty"`
}

// Event is the summary returned when Beaco accepts an event.
type Event struct {
	ID             string  `json:"id"`
	EventType      string  `json:"event_type"`
	Priority       string  `json:"priority"`
	Status         string  `json:"status"`
	RecipientCount int     `json:"recipient_count"`
	HasFailures    bool    `json:"has_failures"`
	IdempotencyKey *string `json:"idempotency_key"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
}

// EventDetail contains an event and its generated notifications.
type EventDetail struct {
	Event
	TemplateID    *string          `json:"template_id"`
	Payload       map[string]any   `json:"payload"`
	Metadata      map[string]any   `json:"metadata"`
	BatchID       *string          `json:"batch_id"`
	Notifications []map[string]any `json:"notifications"`
}

// EventListOptions filters event list requests.
type EventListOptions struct {
	Page, PerPage                                 int
	Status, Priority, EventType, DateFrom, DateTo string
}

// EventsService publishes and queries Beaco events.
type EventsService struct{ client *Client }

// validateEvent enforces the event and recipient invariants shared by publish operations.
func validateEvent(input PublishEventInput) error {
	if input.EventType == "" || len(input.EventType) > 255 {
		return errors.New("beaco: event type must contain 1 to 255 characters")
	}
	if len(input.Recipients) == 0 {
		return errors.New("beaco: recipients must contain at least one recipient")
	}
	for _, recipient := range input.Recipients {
		if len(recipient.Channels) == 0 {
			return errors.New("beaco: each recipient must contain at least one channel")
		}
	}
	return nil
}

// Publish creates one event and requests immediate notification fan-out.
//
// Input must contain an event type of 1 to 255 characters and at least one recipient;
// every recipient must select at least one channel. The call may enqueue one delivery
// per recipient channel. Set IdempotencyKey when retrying must not duplicate work.
//
// Publish returns the accepted event summary. It returns a local validation error,
// a context cancellation error, or *Error when the API rejects or cannot service the request.
func (s *EventsService) Publish(ctx context.Context, input PublishEventInput) (*Event, error) {
	if err := validateEvent(input); err != nil {
		return nil, err
	}
	var event Event
	if err := s.client.request(ctx, http.MethodPost, "/events", input, &event); err != nil {
		return nil, err
	}
	return &event, nil
}

// PublishBatch creates multiple events in one atomic API request.
//
// The slice must be non-empty and every item must satisfy the same requirements as
// Publish. Results preserve input order. The API accepts or rejects the batch as a unit,
// so a failed request does not partially create events.
//
// PublishBatch returns a local validation error, a context cancellation error, or
// *Error when the API rejects or cannot service the request.
func (s *EventsService) PublishBatch(ctx context.Context, events []PublishEventInput) ([]Event, error) {
	if len(events) == 0 {
		return nil, errors.New("beaco: events must contain at least one event")
	}
	for _, event := range events {
		if err := validateEvent(event); err != nil {
			return nil, err
		}
	}
	var result []Event
	if err := s.client.request(ctx, http.MethodPost, "/events/batch", map[string]any{"events": events}, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// List returns one page of events visible to the configured project API key.
//
// Options may filter by lifecycle status, priority, event type, or API-supported date
// strings. Zero pagination values use server defaults. List performs no mutation and
// returns a context cancellation error or *Error when the request fails.
func (s *EventsService) List(ctx context.Context, options EventListOptions) (*Page[Event], error) {
	query := url.Values{}
	for key, value := range map[string]string{
		"status": options.Status, "priority": options.Priority, "event_type": options.EventType,
		"date_from": options.DateFrom, "date_to": options.DateTo,
	} {
		if value != "" {
			query.Set(key, value)
		}
	}
	if options.Page != 0 {
		query.Set("page", strconv.Itoa(options.Page))
	}
	if options.PerPage != 0 {
		query.Set("per_page", strconv.Itoa(options.PerPage))
	}
	var page Page[Event]
	if err := s.client.request(ctx, http.MethodGet, queryPath("/events", query), nil, &page); err != nil {
		return nil, err
	}
	return &page, nil
}

// Retrieve returns one event together with its payload, metadata, and generated notifications.
//
// The eventID must be non-empty and is escaped before it is added to the request path.
// Retrieve returns a validation error, a context cancellation error, or *Error when the
// event is unavailable or the request fails.
func (s *EventsService) Retrieve(ctx context.Context, eventID string) (*EventDetail, error) {
	if err := required(eventID, "event ID"); err != nil {
		return nil, err
	}
	var event EventDetail
	if err := s.client.request(ctx, http.MethodGet, "/events/"+url.PathEscape(eventID), nil, &event); err != nil {
		return nil, err
	}
	return &event, nil
}
