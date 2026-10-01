package beaco

import (
	"context"
	"net/http"
	"net/url"
)

// CreateSuppressionInput identifies one recipient to block.
type CreateSuppressionInput struct {
	Channel   string `json:"channel"`
	Recipient string `json:"recipient"`
	Reason    string `json:"reason,omitempty"`
	Source    string `json:"source,omitempty"`
}

// Suppression is a blocked channel recipient.
type Suppression struct {
	ID        string `json:"id"`
	APIKeyID  string `json:"api_key_id"`
	Channel   string `json:"channel"`
	Recipient string `json:"recipient"`
	Reason    string `json:"reason"`
	Source    string `json:"source"`
	CreatedAt string `json:"created_at"`
}

// SuppressionListOptions filters suppression list requests.
type SuppressionListOptions struct {
	PageOptions
	Channel string
}

// SuppressionsService manages blocked recipients.
type SuppressionsService struct{ client *Client }

// Create blocks future delivery to one recipient on one channel.
//
// Channel and Recipient must be non-empty. Reason may describe a manual action, hard
// bounce, or spam complaint; Source identifies whether the client or system created the
// record. The operation mutates server state and returns the created suppression.
//
// Create returns a local validation error, a context cancellation error, or *Error when
// validation, authorization, or the API request fails.
func (s *SuppressionsService) Create(ctx context.Context, input CreateSuppressionInput) (*Suppression, error) {
	if err := required(input.Channel, "suppression channel"); err != nil {
		return nil, err
	}
	if err := required(input.Recipient, "suppression recipient"); err != nil {
		return nil, err
	}
	var suppression Suppression
	if err := s.client.request(ctx, http.MethodPost, "/suppressions", input, &suppression); err != nil {
		return nil, err
	}
	return &suppression, nil
}

// List returns one page of suppressions owned by the configured API key.
//
// Channel optionally limits results. Zero pagination values use server defaults. List
// performs no mutation and returns a context cancellation error or *Error when the request fails.
func (s *SuppressionsService) List(ctx context.Context, options SuppressionListOptions) (*Page[Suppression], error) {
	query := url.Values{}
	addPage(query, options.PageOptions)
	if options.Channel != "" {
		query.Set("channel", options.Channel)
	}
	var page Page[Suppression]
	if err := s.client.request(ctx, http.MethodGet, queryPath("/suppressions", query), nil, &page); err != nil {
		return nil, err
	}
	return &page, nil
}

// Delete permanently removes a suppression and allows future matching deliveries.
//
// The id must be non-empty. Delete mutates server state and returns a validation error,
// a context cancellation error, or *Error when the record is unavailable or the request fails.
func (s *SuppressionsService) Delete(ctx context.Context, id string) error {
	if err := required(id, "suppression ID"); err != nil {
		return err
	}
	return s.client.request(ctx, http.MethodDelete, "/suppressions/"+url.PathEscape(id), nil, nil)
}
