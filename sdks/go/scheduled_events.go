package beaco

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"time"
)

// CreateScheduledEventInput contains an event and its future delivery time.
type CreateScheduledEventInput struct {
	EventType    string         `json:"event_type"`
	Recipients   []Recipient    `json:"recipients"`
	ScheduledFor time.Time      `json:"scheduled_for"`
	Priority     string         `json:"priority,omitempty"`
	TemplateID   string         `json:"template_id,omitempty"`
	Payload      map[string]any `json:"payload,omitempty"`
	Metadata     map[string]any `json:"metadata,omitempty"`
}

// ScheduledEvent is a deferred event and its current status.
type ScheduledEvent struct {
	ID           string  `json:"id"`
	APIKeyID     string  `json:"api_key_id"`
	EventType    string  `json:"event_type"`
	ScheduledFor string  `json:"scheduled_for"`
	Priority     string  `json:"priority"`
	Status       string  `json:"status"`
	EventID      *string `json:"event_id"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
}

// ScheduledEventListOptions filters scheduled-event list requests.
type ScheduledEventListOptions struct {
	PageOptions
	Status string
}

// ScheduledEventsService creates, lists, and cancels deferred events.
type ScheduledEventsService struct{ client *Client }

// Create stores an event for delivery at Input.ScheduledFor.
//
// The event type and recipients follow Publish validation rules, and ScheduledFor must
// be non-zero. The operation stores deferred work but does not attempt delivery before
// the configured time. It returns the created scheduled-event record.
//
// Create returns a local validation error, a context cancellation error, or *Error when
// the API rejects or cannot service the request.
func (s *ScheduledEventsService) Create(ctx context.Context, input CreateScheduledEventInput) (*ScheduledEvent, error) {
	if err := validateEvent(PublishEventInput{EventType: input.EventType, Recipients: input.Recipients}); err != nil {
		return nil, err
	}
	if input.ScheduledFor.IsZero() {
		return nil, errors.New("beaco: scheduled time is required")
	}
	var event ScheduledEvent
	if err := s.client.request(ctx, http.MethodPost, "/scheduled-events", input, &event); err != nil {
		return nil, err
	}
	return &event, nil
}

// List returns one page of scheduled events visible to the configured project.
//
// Status optionally filters the lifecycle state. Zero pagination values use server
// defaults. List performs no mutation and returns a context cancellation error or *Error
// when the request fails.
func (s *ScheduledEventsService) List(ctx context.Context, options ScheduledEventListOptions) (*Page[ScheduledEvent], error) {
	query := url.Values{}
	addPage(query, options.PageOptions)
	if options.Status != "" {
		query.Set("status", options.Status)
	}
	var page Page[ScheduledEvent]
	if err := s.client.request(ctx, http.MethodGet, queryPath("/scheduled-events", query), nil, &page); err != nil {
		return nil, err
	}
	return &page, nil
}

// Cancel prevents a pending scheduled event from being dispatched.
//
// The id must be non-empty. Cancellation mutates server state and is only valid before
// dispatch. Cancel returns a validation error, a context cancellation error, or *Error
// when the event cannot be cancelled or the request fails.
func (s *ScheduledEventsService) Cancel(ctx context.Context, id string) error {
	if err := required(id, "scheduled event ID"); err != nil {
		return err
	}
	return s.client.request(ctx, http.MethodDelete, "/scheduled-events/"+url.PathEscape(id), nil, nil)
}
