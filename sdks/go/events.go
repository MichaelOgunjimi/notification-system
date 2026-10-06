package beaco

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode"
)

// Recipient identifies one notification recipient and its delivery channels.
type Recipient struct {
	UserID     string   `json:"user_id,omitempty"`
	Channels   []string `json:"channels"`
	Email      string   `json:"email,omitempty"`
	Phone      string   `json:"phone,omitempty"`
	WebhookURL string   `json:"webhook_url,omitempty"`
}

// InlineEmail is already-rendered content sent without Jinja processing.
type InlineEmail struct {
	Subject string `json:"subject,omitempty"`
	HTML    string `json:"html"`
	Text    string `json:"text,omitempty"`
	// FromLocal is the sender name before the @, e.g. "orders". The domain is always the
	// server's verified domain.
	FromLocal string `json:"from_local,omitempty"`
	// FromName is the sender display name.
	FromName string `json:"from_name,omitempty"`
	// ReplyTo is the address replies go to. Any valid email address.
	ReplyTo string `json:"reply_to,omitempty"`
}

const (
	maxAttachments = 10
	// maxAttachmentBytes is Resend's 40 MB email limit after Base64 encoding.
	maxAttachmentBytes = 30_000_000
)

// Attachment is an email attachment Beaco never stores: the email provider downloads URL
// when the email is sent. It applies to email delivery and needs the Resend provider.
type Attachment struct {
	// Filename is shown to the recipient. It must not contain slashes or control characters.
	Filename string `json:"filename"`
	// URL is the http(s) location of the file. It must stay reachable until delivery
	// succeeds, including retries.
	URL string `json:"url"`
	// SizeBytes is the declared file size, used to reject oversized emails early. It is
	// not verified.
	SizeBytes int64 `json:"size_bytes"`
}

// validateAttachments mirrors the API limits: 10 files, positive sizes, 30 MB declared in total.
func validateAttachments(attachments []Attachment) error {
	if len(attachments) > maxAttachments {
		return errors.New("beaco: attachments must contain at most 10 files")
	}
	var total int64
	for _, a := range attachments {
		u, err := url.Parse(a.URL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return errors.New("beaco: attachment URL must be an http or https URL")
		}
		if a.Filename == "" || len(a.Filename) > 255 || strings.ContainsAny(a.Filename, "/\\") ||
			strings.IndexFunc(a.Filename, unicode.IsControl) >= 0 {
			return errors.New("beaco: attachment filename must be 1 to 255 characters without slashes or control characters")
		}
		if a.SizeBytes <= 0 {
			return errors.New("beaco: attachment size must be positive")
		}
		total += a.SizeBytes
	}
	if total > maxAttachmentBytes {
		return errors.New("beaco: attachments exceed 30000000 bytes in total")
	}
	return nil
}

// PublishEventInput contains an event and its delivery controls.
type PublishEventInput struct {
	EventType    string       `json:"event_type"`
	Recipients   []Recipient  `json:"recipients"`
	Priority     string       `json:"priority,omitempty"`
	TemplateID   string       `json:"template_id,omitempty"`
	TemplateName string       `json:"template_name,omitempty"`
	Inline       *InlineEmail `json:"inline,omitempty"`
	// Attachments are files attached to email notifications. See Attachment.
	Attachments    []Attachment   `json:"attachments,omitempty"`
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

// validateEventBase enforces event and recipient invariants shared with scheduled events.
func validateEventBase(input PublishEventInput) error {
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

// validateEvent additionally enforces the content source required for immediate delivery.
func validateEvent(input PublishEventInput) error {
	if err := validateEventBase(input); err != nil {
		return err
	}
	sources := 0
	if input.TemplateID != "" {
		sources++
	}
	if input.TemplateName != "" {
		sources++
	}
	if input.Inline != nil {
		sources++
	}
	if sources != 1 {
		return errors.New("beaco: exactly one of template ID, template name, or inline is required")
	}
	return validateAttachments(input.Attachments)
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
