package beaco

import (
	"context"
	"net/http"
	"net/url"
)

// CreateTemplateInput contains a reusable delivery template.
type CreateTemplateInput struct {
	Name              string   `json:"name"`
	Channel           string   `json:"channel"`
	Subject           string   `json:"subject,omitempty"`
	Body              string   `json:"body"`
	TextBody          string   `json:"text_body,omitempty"`
	Variables         []string `json:"variables,omitempty"`
	OnMissingVariable string   `json:"on_missing_variable,omitempty"`
}

// UpdateTemplateInput contains editable template fields.
type UpdateTemplateInput struct {
	Name              string   `json:"name,omitempty"`
	Channel           string   `json:"channel,omitempty"`
	Subject           *string  `json:"subject,omitempty"`
	Body              string   `json:"body,omitempty"`
	TextBody          *string  `json:"text_body,omitempty"`
	Variables         []string `json:"variables,omitempty"`
	OnMissingVariable string   `json:"on_missing_variable,omitempty"`
}

// UpsertTemplateInput contains complete template content synchronized by name.
type UpsertTemplateInput struct {
	Subject           string   `json:"subject,omitempty"`
	Body              string   `json:"body"`
	TextBody          string   `json:"text_body,omitempty"`
	Variables         []string `json:"variables,omitempty"`
	OnMissingVariable string   `json:"on_missing_variable,omitempty"`
}

// ImportTemplateInput contains HTML and sample values used to mark variable text.
type ImportTemplateInput struct {
	Name      string            `json:"name"`
	Subject   string            `json:"subject,omitempty"`
	HTML      string            `json:"html"`
	Variables map[string]string `json:"variables,omitempty"`
}

// Template is a reusable channel-specific delivery template.
type Template struct {
	ID                string   `json:"id"`
	ProjectID         *string  `json:"project_id"`
	APIKeyID          *string  `json:"api_key_id"`
	Name              string   `json:"name"`
	Channel           string   `json:"channel"`
	Subject           *string  `json:"subject"`
	Body              string   `json:"body"`
	TextBody          *string  `json:"text_body"`
	Variables         []string `json:"variables"`
	DetectedVariables []string `json:"detected_variables"`
	OnMissingVariable string   `json:"on_missing_variable"`
	IsActive          bool     `json:"is_active"`
	CreatedAt         string   `json:"created_at"`
	UpdatedAt         string   `json:"updated_at"`
}

// TemplatePreview contains rendered template content.
type TemplatePreview struct {
	Subject          *string  `json:"subject"`
	HTML             string   `json:"html"`
	Text             string   `json:"text"`
	Body             string   `json:"body"`
	VariablesUsed    []string `json:"variables_used"`
	MissingVariables []string `json:"missing_variables"`
}

// ImportTemplateResult contains an imported template and its sample preview.
type ImportTemplateResult struct {
	Template Template        `json:"template"`
	Preview  TemplatePreview `json:"preview"`
}

// TemplateListOptions filters template list requests.
type TemplateListOptions struct {
	PageOptions
	Channel string
}

// TemplatesService creates, previews, updates, and removes templates.
type TemplatesService struct{ client *Client }

// Create stores a reusable, channel-specific delivery template for the project.
//
// Name, Channel, and Body are required. Subject is normally used for email templates,
// and Variables documents values expected during rendering. The operation mutates
// server state and returns the created template.
//
// Create returns a local validation error, a context cancellation error, or *Error when
// validation, authorization, or the API request fails.
func (s *TemplatesService) Create(ctx context.Context, input CreateTemplateInput) (*Template, error) {
	for name, value := range map[string]string{"template name": input.Name, "template channel": input.Channel, "template body": input.Body} {
		if err := required(value, name); err != nil {
			return nil, err
		}
	}
	var template Template
	if err := s.client.request(ctx, http.MethodPost, "/templates", input, &template); err != nil {
		return nil, err
	}
	return &template, nil
}

// List returns one page of templates available to the configured project.
//
// Channel optionally limits results to email, SMS, or webhook templates. Zero pagination
// values use server defaults. List performs no mutation and returns a context cancellation
// error or *Error when the request fails.
func (s *TemplatesService) List(ctx context.Context, options TemplateListOptions) (*Page[Template], error) {
	query := url.Values{}
	addPage(query, options.PageOptions)
	if options.Channel != "" {
		query.Set("channel", options.Channel)
	}
	var page Page[Template]
	if err := s.client.request(ctx, http.MethodGet, queryPath("/templates", query), nil, &page); err != nil {
		return nil, err
	}
	return &page, nil
}

// Retrieve returns a template by identifier without modifying it.
//
// The id must be non-empty and is escaped before it is added to the request path.
// Retrieve returns a validation error, a context cancellation error, or *Error when the
// template is unavailable or the request fails.
func (s *TemplatesService) Retrieve(ctx context.Context, id string) (*Template, error) {
	if err := required(id, "template ID"); err != nil {
		return nil, err
	}
	var template Template
	if err := s.client.request(ctx, http.MethodGet, "/templates/"+url.PathEscape(id), nil, &template); err != nil {
		return nil, err
	}
	return &template, nil
}

// Update replaces the supplied editable fields on an owned template.
//
// The id must be non-empty. A non-nil Subject may set or replace the subject; other zero
// values are omitted by JSON encoding. The operation mutates server state and returns the
// updated template.
//
// Update returns a validation error, a context cancellation error, or *Error when
// validation, ownership, or the API request fails.
func (s *TemplatesService) Update(ctx context.Context, id string, input UpdateTemplateInput) (*Template, error) {
	if err := required(id, "template ID"); err != nil {
		return nil, err
	}
	var template Template
	if err := s.client.request(ctx, http.MethodPut, "/templates/"+url.PathEscape(id), input, &template); err != nil {
		return nil, err
	}
	return &template, nil
}

// UpsertByName creates or updates one project template identified by name and channel.
func (s *TemplatesService) UpsertByName(ctx context.Context, name, channel string, input UpsertTemplateInput) (*Template, error) {
	for field, value := range map[string]string{"template name": name, "template channel": channel, "template body": input.Body} {
		if err := required(value, field); err != nil {
			return nil, err
		}
	}
	query := url.Values{"channel": []string{channel}}
	var template Template
	if err := s.client.request(ctx, http.MethodPut, queryPath("/templates/by-name/"+url.PathEscape(name), query), input, &template); err != nil {
		return nil, err
	}
	return &template, nil
}

// ImportHTML creates an email template from HTML and unambiguous sample text values.
func (s *TemplatesService) ImportHTML(ctx context.Context, input ImportTemplateInput) (*ImportTemplateResult, error) {
	for field, value := range map[string]string{"template name": input.Name, "template HTML": input.HTML} {
		if err := required(value, field); err != nil {
			return nil, err
		}
	}
	var result ImportTemplateResult
	if err := s.client.request(ctx, http.MethodPost, "/templates/import", input, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// Preview renders a template with variables without creating an event or notification.
//
// The id must be non-empty. The returned Subject and Body contain the rendered content.
// Preview is side-effect free with respect to delivery and returns a validation error,
// a context cancellation error, or *Error when rendering or the request fails.
func (s *TemplatesService) Preview(ctx context.Context, id string, variables map[string]any) (*TemplatePreview, error) {
	if err := required(id, "template ID"); err != nil {
		return nil, err
	}
	var preview TemplatePreview
	if err := s.client.request(ctx, http.MethodPost, "/templates/"+url.PathEscape(id)+"/preview", map[string]any{"variables": variables}, &preview); err != nil {
		return nil, err
	}
	return &preview, nil
}

// Delete soft-deletes an owned template.
//
// The id must be non-empty. The template becomes unavailable for future sends while
// historical delivery records remain. Delete returns a validation error, a context
// cancellation error, or *Error when ownership validation or the request fails.
func (s *TemplatesService) Delete(ctx context.Context, id string) error {
	if err := required(id, "template ID"); err != nil {
		return err
	}
	return s.client.request(ctx, http.MethodDelete, "/templates/"+url.PathEscape(id), nil, nil)
}
