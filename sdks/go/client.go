// Package beaco provides a server-side client for the Beaco notification API.
package beaco

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const defaultBaseURL = "https://beaco.michaelogunjimi.com/api/v1"

// Options configures a Beaco client.
type Options struct {
	BaseURL           string
	Timeout           time.Duration
	HTTPClient        *http.Client
	AllowInsecureHTTP bool
}

// Error describes a failed Beaco API or network request.
type Error struct {
	Code      string
	Status    int
	Message   string
	Details   []ValidationIssue
	Retryable bool
}

// ValidationIssue identifies one invalid request field.
type ValidationIssue struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// Error returns the human-readable message supplied by the Beaco API or transport.
// Inspect Code, Status, Details, and Retryable for programmatic error handling.
func (e *Error) Error() string { return e.Message }

// Page is one page returned by a Beaco list operation.
type Page[T any] struct {
	Items      []T `json:"items"`
	Total      int `json:"total"`
	Page       int `json:"page"`
	PerPage    int `json:"per_page"`
	TotalPages int `json:"total_pages"`
}

// PageOptions configures pagination shared by list operations.
type PageOptions struct {
	Page    int
	PerPage int
}

// Client is a server-side Beaco API client.
type Client struct {
	Events          *EventsService
	Templates       *TemplatesService
	Notifications   *NotificationsService
	ScheduledEvents *ScheduledEventsService
	Suppressions    *SuppressionsService
	apiKey          string
	baseURL         string
	http            *http.Client
}

// New creates a reusable, server-side client authenticated with a secret project API key.
//
// The key is sent in the X-API-Key header on every request and must not be exposed to
// browsers or untrusted clients. A nil Options value uses the production API endpoint
// and a 10-second timeout. Remote endpoints must use HTTPS unless AllowInsecureHTTP is
// explicitly enabled; loopback HTTP is allowed for local development.
//
// New performs no network I/O. It returns an error when the key is empty, the timeout
// is not positive, or the configured base URL is invalid or insecure.
func New(apiKey string, options *Options) (*Client, error) {
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return nil, errors.New("beaco: api key is required")
	}

	baseURL := defaultBaseURL
	timeout := 10 * time.Second
	httpClient := (*http.Client)(nil)
	allowInsecure := false
	if options != nil {
		if options.BaseURL != "" {
			baseURL = options.BaseURL
		}
		if options.Timeout != 0 {
			timeout = options.Timeout
		}
		httpClient = options.HTTPClient
		allowInsecure = options.AllowInsecureHTTP
	}
	if timeout <= 0 {
		return nil, errors.New("beaco: timeout must be greater than zero")
	}
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("beaco: invalid base URL: %w", err)
	}
	if parsed.Host == "" {
		return nil, errors.New("beaco: base URL must be absolute")
	}
	loopback := parsed.Hostname() == "localhost" || parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "::1"
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && (loopback || allowInsecure)) {
		return nil, errors.New("beaco: base URL must use HTTPS unless it is a loopback URL")
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: timeout}
	}

	client := &Client{apiKey: apiKey, baseURL: strings.TrimRight(baseURL, "/"), http: httpClient}
	client.Events = &EventsService{client: client}
	client.Templates = &TemplatesService{client: client}
	client.Notifications = &NotificationsService{client: client}
	client.ScheduledEvents = &ScheduledEventsService{client: client}
	client.Suppressions = &SuppressionsService{client: client}
	return client, nil
}

// request sends an authenticated JSON request and decodes a successful response into result.
// It returns *Error for API and network failures, or the underlying encoding/request error.
func (c *Client) request(ctx context.Context, method, path string, body, result any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", c.apiKey)

	response, err := c.http.Do(req)
	if err != nil {
		return &Error{Code: "NETWORK_ERROR", Status: 0, Message: "Unable to reach the Beaco API.", Retryable: true}
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var payload struct {
			Error struct {
				Code    string            `json:"code"`
				Message string            `json:"message"`
				Details []ValidationIssue `json:"details"`
			} `json:"error"`
			Detail string `json:"detail"`
		}
		_ = json.NewDecoder(response.Body).Decode(&payload)
		message := payload.Error.Message
		if message == "" {
			message = payload.Detail
		}
		if message == "" {
			message = fmt.Sprintf("Beaco API request failed (%d).", response.StatusCode)
		}
		code := payload.Error.Code
		if code == "" {
			code = "API_ERROR"
		}
		return &Error{Code: code, Status: response.StatusCode, Message: message, Details: payload.Error.Details, Retryable: response.StatusCode == 429 || response.StatusCode >= 500}
	}
	if response.StatusCode == http.StatusNoContent || result == nil {
		return nil
	}
	return json.NewDecoder(response.Body).Decode(result)
}

// addPage adds non-zero pagination options to a query without replacing other filters.
func addPage(query url.Values, options PageOptions) {
	if options.Page != 0 {
		query.Set("page", strconv.Itoa(options.Page))
	}
	if options.PerPage != 0 {
		query.Set("per_page", strconv.Itoa(options.PerPage))
	}
}

// queryPath appends an encoded query string when at least one parameter is present.
func queryPath(path string, query url.Values) string {
	if encoded := query.Encode(); encoded != "" {
		return path + "?" + encoded
	}
	return path
}

// required returns a field-specific validation error when value is empty or whitespace.
func required(value, name string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("beaco: %s is required", name)
	}
	return nil
}
