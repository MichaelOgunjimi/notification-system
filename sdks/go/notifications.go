package beaco

import (
	"context"
	"net/http"
	"net/url"
)

// Notification is a generated delivery record.
type Notification struct {
	ID               string  `json:"id"`
	EventID          string  `json:"event_id"`
	Channel          string  `json:"channel"`
	Status           string  `json:"status"`
	RecipientAddress string  `json:"recipient_address"`
	RetryCount       int     `json:"retry_count"`
	MaxRetries       int     `json:"max_retries"`
	RenderedSubject  *string `json:"rendered_subject"`
	ErrorMessage     *string `json:"error_message"`
	DeliveredAt      *string `json:"delivered_at"`
	FailedAt         *string `json:"failed_at"`
	NextRetryAt      *string `json:"next_retry_at"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        string  `json:"updated_at"`
}

// NotificationLog is one recorded delivery status transition.
type NotificationLog struct {
	ID            string  `json:"id"`
	Status        string  `json:"status"`
	Message       *string `json:"message"`
	AttemptNumber int     `json:"attempt_number"`
	CreatedAt     string  `json:"created_at"`
}

// NotificationDetail contains a notification and its delivery history.
type NotificationDetail struct {
	Notification
	Priority         string            `json:"priority"`
	RecipientUserID  *string           `json:"recipient_user_id"`
	RenderedBody     *string           `json:"rendered_body"`
	NotificationLogs []NotificationLog `json:"notification_logs"`
}

// NotificationListOptions filters notification list requests.
type NotificationListOptions struct {
	PageOptions
	Status, Channel, DateFrom, DateTo, Recipient string
}

// NotificationsService provides read-only access to notification records.
type NotificationsService struct{ client *Client }

// List returns one page of notification delivery records visible to the project.
//
// Options may filter by status, channel, recipient, or API-supported date strings. Zero
// pagination values use server defaults. List performs no mutation and returns a context
// cancellation error or *Error when the request fails.
func (s *NotificationsService) List(ctx context.Context, options NotificationListOptions) (*Page[Notification], error) {
	query := url.Values{}
	addPage(query, options.PageOptions)
	for key, value := range map[string]string{"status": options.Status, "channel": options.Channel, "date_from": options.DateFrom, "date_to": options.DateTo, "recipient": options.Recipient} {
		if value != "" {
			query.Set(key, value)
		}
	}
	var page Page[Notification]
	if err := s.client.request(ctx, http.MethodGet, queryPath("/notifications", query), nil, &page); err != nil {
		return nil, err
	}
	return &page, nil
}

// Retrieve returns a notification, rendered content, and delivery-attempt history.
//
// The id must be non-empty and is escaped before it is added to the request path.
// Retrieve performs no mutation and returns a validation error, a context cancellation
// error, or *Error when the notification is unavailable or the request fails.
func (s *NotificationsService) Retrieve(ctx context.Context, id string) (*NotificationDetail, error) {
	if err := required(id, "notification ID"); err != nil {
		return nil, err
	}
	var notification NotificationDetail
	if err := s.client.request(ctx, http.MethodGet, "/notifications/"+url.PathEscape(id), nil, &notification); err != nil {
		return nil, err
	}
	return &notification, nil
}
